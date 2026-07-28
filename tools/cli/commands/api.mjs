import fs from 'node:fs/promises';
import path from 'node:path';

import { CliError } from '../lib/errors.mjs';
import {
  fileContentsEqual,
  readJson,
  stableJson,
  writeAtomic,
  writeJsonAtomic,
} from '../lib/files.mjs';
import {
  fromRoot,
  profileDirectory,
  reportDirectory,
  typeProfileDirectory,
} from '../lib/paths.mjs';
import { run } from '../lib/process.mjs';
import {
  compatibilityProfiles,
  exactTargets,
  profileForTarget,
  profileTargets,
  resolveTarget,
} from '../lib/target.mjs';
import {
  equalEntries,
  makeCompatibilityProfile,
  renderDeclaration,
  renderReport,
  validateProfileProvenance,
} from '../../api/profile.mjs';

function optionValue(argumentsList, option) {
  const index = argumentsList.indexOf(option);
  if (index === -1) return null;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--'))
    throw new CliError(`${option} requires a value`);
  return value;
}

function assertExactTarget(target, config) {
  if (profileForTarget(config, target).kind !== 'exact') {
    throw new CliError(
      `API updates require an exact configured target: ${target}`,
    );
  }
}

function profilePath(target) {
  return path.join(profileDirectory, `${target}.json`);
}

async function loadProfile(target) {
  const profile = await readJson(profilePath(target));
  if (
    profile.profileVersion !== 1 ||
    !Array.isArray(profile.entries) ||
    !profile.core
  ) {
    throw new CliError(`Invalid API profile: ${target}`, 4);
  }
  try {
    validateProfileProvenance(profile);
  } catch (error) {
    throw new CliError(`${target}: ${error.message}`, 4);
  }
  return profile;
}

async function loadOverride(target) {
  const file = fromRoot('api', 'overrides', `${target}.json`);
  try {
    return await readJson(file);
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

async function scannerResult(core) {
  const coreDirectory = path.resolve(core);
  const scanDirectory = fromRoot('tools', 'seal-api-scan');
  const result = await run('go', ['run', '.', '--core', coreDirectory], {
    capture: true,
    cwd: scanDirectory,
  });
  if (result.code !== 0) {
    throw new CliError(
      `Go AST scan failed:\n${result.stderr || result.stdout}`,
      5,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new CliError(
      `Go AST scanner returned invalid JSON: ${error.message}`,
      5,
    );
  }
}

async function assertCleanCore(core, allowDirty) {
  const result = await run('git', ['-C', core, 'status', '--porcelain'], {
    capture: true,
  });
  if (result.code === 0 && result.stdout.trim() && !allowDirty) {
    throw new CliError(
      'Refusing to scan a dirty core; pass --allow-dirty only for local investigation',
      4,
    );
  }
}

async function coreCommit(core, explicitCommit) {
  if (explicitCommit) return explicitCommit;
  const result = await run('git', ['-C', core, 'rev-parse', 'HEAD'], {
    capture: true,
  });
  if (result.code !== 0) {
    throw new CliError(
      'The core source is not a Git checkout; provide --commit <exact-commit>',
      4,
    );
  }
  return result.stdout.trim();
}

async function profileFromCore(target, core, argumentsList) {
  await assertCleanCore(core, argumentsList.includes('--allow-dirty'));
  const discovered = await scannerResult(core);
  const override = await loadOverride(target);
  const entries = discovered.entries.map((entry) => ({
    ...entry,
    ...(override.entries?.[entry.path] ?? {}),
  }));
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const profile = {
    core: {
      commit: await coreCommit(core, optionValue(argumentsList, '--commit')),
      sourceFingerprint: discovered.sourceFingerprint,
    },
    entries,
    profileVersion: 1,
    provenance: override.provenance,
    sealDiceVersion: target,
    typeDeclarationOptions: override.typeDeclarationOptions,
    typeDeclarationSource: override.typeDeclarationSource ?? 'types/seal.d.ts',
    types: discovered.types,
  };
  try {
    validateProfileProvenance(profile);
  } catch (error) {
    throw new CliError(`${target}: ${error.message}`, 4);
  }
  return profile;
}

async function generatedOutputs(target, profile) {
  const declarationSource = fromRoot(profile.typeDeclarationSource);
  const source = await fs.readFile(declarationSource, 'utf8');
  const declaration = renderDeclaration(source, profile);
  return [
    {
      content: declaration,
      file: path.join(typeProfileDirectory, target, 'seal.d.ts'),
    },
    {
      content: renderReport(profile),
      file: path.join(reportDirectory, `${target}.api.md`),
    },
  ];
}

async function writeOrCheck(files, check) {
  const mismatches = [];
  for (const file of files) {
    if (check) {
      if (!(await fileContentsEqual(file.file, file.content)))
        mismatches.push(file.file);
    } else {
      await writeAtomic(file.file, file.content);
    }
  }
  if (mismatches.length) {
    throw new CliError(
      `Generated API files are stale:\n${mismatches.join('\n')}`,
      4,
    );
  }
}

async function generateOne(target, check) {
  const profile = await loadProfile(target);
  await writeOrCheck(await generatedOutputs(target, profile), check);
}

async function generateCompatibility(compatibility, check) {
  const profiles = await Promise.all(
    compatibility.members.map((target) => loadProfile(target)),
  );
  const override = await loadOverride(compatibility.id);
  let profile;
  try {
    profile = makeCompatibilityProfile(profiles, {
      ...override,
      id: compatibility.id,
    });
  } catch (error) {
    throw new CliError(error.message, 4);
  }
  const profileFile = profilePath(compatibility.id);
  if (check) {
    if (!(await fileContentsEqual(profileFile, stableJson(profile)))) {
      throw new CliError(
        `Generated compatibility profile is stale: ${profileFile}`,
        4,
      );
    }
  } else {
    await writeJsonAtomic(profileFile, profile);
  }
  await writeOrCheck(await generatedOutputs(compatibility.id, profile), check);
}

async function generate(argumentsList, config) {
  const check = argumentsList.includes('--check');
  const allTargets = argumentsList.includes('--all-targets');
  const target = allTargets ? null : resolveTarget(config, argumentsList);
  if (allTargets) {
    for (const exactTarget of exactTargets(config))
      await generateOne(exactTarget, check);
    for (const compatibility of compatibilityProfiles(config))
      await generateCompatibility(compatibility, check);
    return;
  }
  const selected = profileForTarget(config, target);
  if (selected.kind === 'compatibility')
    return generateCompatibility(selected, check);
  await generateOne(target, check);
}

async function verify(core, target, argumentsList) {
  await assertCleanCore(core, argumentsList.includes('--allow-dirty'));
  const discovered = await scannerResult(core);
  const profile = await loadProfile(target);
  const expected = new Map(profile.entries.map((entry) => [entry.path, entry]));
  const actual = new Map(
    discovered.entries.map((entry) => [entry.path, entry]),
  );
  const changes = [];
  for (const memberPath of new Set([...expected.keys(), ...actual.keys()])) {
    const oldEntry = expected.get(memberPath);
    const newEntry = actual.get(memberPath);
    if (!oldEntry || !newEntry || !equalEntries(oldEntry, newEntry)) {
      changes.push(memberPath);
    }
  }
  if (
    changes.length ||
    profile.core.sourceFingerprint !== discovered.sourceFingerprint
  ) {
    throw new CliError(
      `API mismatch for ${target}: ${changes.join(', ') || 'source fingerprint changed'}`,
      4,
    );
  }
  process.stdout.write(`API profile ${target} matches ${core}.\n`);
}

async function diffProfiles(from, to, config) {
  profileForTarget(config, from);
  profileForTarget(config, to);
  const first = await loadProfile(from);
  const second = await loadProfile(to);
  const firstEntries = new Map(
    first.entries.map((entry) => [entry.path, entry]),
  );
  const secondEntries = new Map(
    second.entries.map((entry) => [entry.path, entry]),
  );
  const lines = [`# API diff: ${from} to ${to}`, ''];
  for (const memberPath of [
    ...new Set([...firstEntries.keys(), ...secondEntries.keys()]),
  ].sort()) {
    const before = firstEntries.get(memberPath);
    const after = secondEntries.get(memberPath);
    if (!before) lines.push(`- Added: \`${memberPath}\``);
    else if (!after) lines.push(`- Removed: \`${memberPath}\``);
    else if (!equalEntries(before, after))
      lines.push(`- Changed: \`${memberPath}\``);
  }
  if (lines.length === 2) lines.push('- No exported API differences.');
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function check(json, config) {
  await generate(['--all-targets', '--check'], config);
  const result = {
    ok: true,
    profiles: profileTargets(config),
  };
  process.stdout.write(
    json
      ? `${JSON.stringify(result)}\n`
      : 'API profiles, declarations and reports are current.\n',
  );
}

export async function commandApi(argumentsList, config) {
  const [action = 'list', ...rest] = argumentsList;
  if (action === 'list') {
    for (const target of profileTargets(config)) {
      const profile = await loadProfile(target);
      process.stdout.write(
        `${target}\t${profile.core.commit ?? profile.core.commits?.join(',')}\n`,
      );
    }
    return;
  }
  if (action === 'inspect') {
    const core = optionValue(rest, '--core') ?? process.env.SEAL_CORE_DIR;
    if (!core)
      throw new CliError('api inspect requires --core <path> or SEAL_CORE_DIR');
    await assertCleanCore(core, rest.includes('--allow-dirty'));
    process.stdout.write(`${stableJson(await scannerResult(core))}`);
    return;
  }
  if (action === 'update') {
    const core = optionValue(rest, '--core') ?? process.env.SEAL_CORE_DIR;
    if (!core)
      throw new CliError('api update requires --core <path> or SEAL_CORE_DIR');
    const target = resolveTarget(config, rest, { allowCompatibility: false });
    assertExactTarget(target, config);
    const profile = await profileFromCore(target, core, rest);
    await writeJsonAtomic(profilePath(target), profile);
    await generate(['--all-targets'], config);
    process.stdout.write(`Updated API profile ${target}.\n`);
    return;
  }
  if (action === 'verify') {
    const core = optionValue(rest, '--core') ?? process.env.SEAL_CORE_DIR;
    if (!core)
      throw new CliError('api verify requires --core <path> or SEAL_CORE_DIR');
    const target = resolveTarget(config, rest, { allowCompatibility: false });
    assertExactTarget(target, config);
    return verify(core, target, rest);
  }
  if (action === 'generate') return generate(rest, config);
  if (action === 'diff') {
    const from = optionValue(rest, '--from');
    const to = optionValue(rest, '--to');
    if (!from || !to)
      throw new CliError('api diff requires --from <id> --to <id>');
    return diffProfiles(from, to, config);
  }
  if (action === 'check') return check(rest.includes('--json'), config);
  if (action === 'probe') {
    const core = optionValue(rest, '--core') ?? process.env.SEAL_CORE_DIR;
    if (!core)
      throw new CliError('api probe requires --core <path> or SEAL_CORE_DIR');
    const target = resolveTarget(config, rest, { allowCompatibility: false });
    assertExactTarget(target, config);
    const { probeRuntime } = await import('../../api/probe.mjs');
    return probeRuntime({ core, target });
  }
  throw new CliError(`Unknown API command: ${action}`);
}
