import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { commandApi } from './commands/api.mjs';
import {
  loadConfig,
  lockfileState,
  readPackageMetadata,
  resolvePackageManager,
} from './lib/config.mjs';
import { CliError, assert } from './lib/errors.mjs';
import {
  removeKnownDirectory,
  sha256,
  stableJson,
  writeJsonAtomic,
  writeAtomic,
} from './lib/files.mjs';
import { artifactName, loadExtensionMetadata } from './lib/metadata.mjs';
import { fromRoot, rootDirectory } from './lib/paths.mjs';
import {
  dependencyCommand,
  installDependencies,
} from './lib/package-manager.mjs';
import { run, runChecked } from './lib/process.mjs';
import { findTestFiles } from './lib/test-files.mjs';
import {
  exactTargets,
  profileForTarget,
  profileTargets,
  resolveTarget,
  targetFromArguments,
  tsconfigForTarget,
} from './lib/target.mjs';

const usage = `Usage:
  ./sealw <command> [options]

Core commands:
  help                         Show command help
  version                      Show template, toolchain and profile versions
  doctor [--json]              Diagnose environment and configuration
  install [--update-lock]      Install dependencies reproducibly
  fmt [--check]                Format or check project files
  lint                         Run ESLint
  typecheck [--target <id>]    Typecheck one API profile
  test [--target <id>|--all-targets]
                               Run unit, mock and bundle tests
  check [--target <id>|--all-targets]
                               Run the standard verification pipeline
  watch [--target <id>]        Rebuild development bundle on changes
  build [--target <id>]        Build dist artifact
  package [--target <id>]      Verify then produce a release artifact and checksum
  clean                        Remove known generated outputs only

Dependency commands:
  deps add <package...> [--dev]
  deps remove <package...>
  deps update
  deps status

Target commands:
  target list
  target show
  target check <id>

API commands:
  api list
  api inspect --core <path>
  api verify --core <path> --target <id>
  api update --core <path> --target <id>
  api generate [--target <id>|--all-targets]
  api diff --from <id> --to <id>
  api check [--json]
  api probe --core <path> --target <id>`;

async function localTool(name) {
  const executable = fromRoot('node_modules', '.bin', name);
  try {
    await fs.access(executable);
  } catch {
    throw new CliError(
      `Dependencies are not installed; run ./sealw install before ${name}`,
      2,
    );
  }
  return executable;
}

async function typecheck(config, target) {
  const tsc = await localTool('tsc');
  const tsconfig = await tsconfigForTarget(config, target);
  await runChecked(tsc, ['--noEmit', '--project', tsconfig]);
}

async function format(check) {
  const prettier = await localTool('prettier');
  await runChecked(prettier, [check ? '--check' : '--write', '.']);
}

async function lint() {
  const eslint = await localTool('eslint');
  await runChecked(eslint, ['.']);
}

async function build(config, target, mode = 'production') {
  await typecheck(config, target);
  const { buildBundle } = await import('../tasks/build.mjs');
  const output = await buildBundle({ config, mode, target });
  process.stdout.write(
    `Built ${path.relative(rootDirectory, output)} for ${target}.\n`,
  );
  return output;
}

async function runHostTests(target) {
  const testDirectory = fromRoot('tests');
  const testFiles = await findTestFiles(testDirectory);
  assert(testFiles.length > 0, 'No Node test files were found', 3);
  await runChecked(process.execPath, ['--test', ...testFiles], {
    env: { SEAL_TEST_TARGET: target },
  });
}

async function bundleSmoke(config, target) {
  const { buildBundle } = await import('../tasks/build.mjs');
  await buildBundle({ config, mode: 'development', target });
  await runChecked(process.execPath, [
    'tools/tasks/bundle-smoke.mjs',
    '--target',
    target,
  ]);
}

async function testTarget(config, target) {
  await runHostTests(target);
  await bundleSmoke(config, target);
}

async function testAllTargets(config) {
  for (const target of exactTargets(config)) await testTarget(config, target);
}

async function test(config, argumentsList) {
  const allTargets = argumentsList.includes('--all-targets');
  assert(
    !(allTargets && targetFromArguments(argumentsList)),
    'test --all-targets cannot be combined with --target',
  );
  if (allTargets) return testAllTargets(config);
  return testTarget(config, resolveTarget(config, argumentsList));
}

async function doctor(config, json) {
  const metadata = await readPackageMetadata();
  const extension = await loadExtensionMetadata();
  const locks = await lockfileState();
  const details = {
    config: 'valid',
    extension: { id: extension.id, version: extension.version },
    corePath: process.env.SEAL_CORE_DIR ?? null,
    node: process.versions.node,
    npm: null,
    packageManager: config.packageManager,
    packageManagerVersion: metadata.packageManager ?? null,
    profiles: profileTargets(config),
    repository: rootDirectory,
    lockfiles: locks,
  };
  const npm = await run('npm', ['--version'], { capture: true });
  if (npm.code === 0) details.npm = npm.stdout.trim();
  const expectedNode = (await fs.readFile(fromRoot('.nvmrc'), 'utf8')).trim();
  const problems = [];
  if (details.node !== expectedNode)
    problems.push(`Node ${expectedNode} required, found ${details.node}`);
  if (locks.length !== 1)
    problems.push('exactly one canonical lockfile is required');
  if (details.npm === null) problems.push('npm is not available');
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ...details, ok: problems.length === 0, problems }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(`Repository: ${details.repository}\n`);
    process.stdout.write(`Node: ${details.node} (required ${expectedNode})\n`);
    process.stdout.write(`npm: ${details.npm ?? 'unavailable'}\n`);
    process.stdout.write(`Package manager: ${details.packageManager}\n`);
    process.stdout.write(`Lockfile: ${locks.join(', ') || 'missing'}\n`);
    process.stdout.write(`Profiles: ${details.profiles.join(', ')}\n`);
    for (const problem of problems)
      process.stdout.write(`Problem: ${problem}\n`);
  }
  if (problems.length) throw new CliError('Environment diagnosis failed');
}

async function packageArtifact(config, target) {
  const extension = await loadExtensionMetadata({ release: true });
  const profile = profileForTarget(config, target);
  await check(
    config,
    profile.kind === 'compatibility' ? ['--all-targets'] : ['--target', target],
  );
  const output = await build(config, target, 'production');
  const artifact = artifactName(extension);
  const releaseDirectory = fromRoot(config.release.directory);
  const releasePath = path.join(releaseDirectory, artifact);
  await fs.mkdir(releaseDirectory, { recursive: true });
  const content = await fs.readFile(output);
  const temporary = path.join(
    releaseDirectory,
    `.${artifact}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, releasePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  const digest = sha256(content);
  await writeAtomic(`${releasePath}.sha256`, `${digest}  ${artifact}\n`);
  const apiProfile = JSON.parse(
    await fs.readFile(fromRoot('api', 'profiles', `${target}.json`), 'utf8'),
  );
  const manifest = {
    artifact,
    author: extension.author,
    id: extension.id,
    license: extension.license,
    name: extension.name,
    profile: target,
    profileHash: `sha256:${sha256(stableJson(apiProfile))}`,
    sha256: digest,
    version: extension.version,
  };
  await writeJsonAtomic(path.join(releaseDirectory, 'manifest.json'), manifest);
  process.stdout.write(
    `Packaged ${path.relative(rootDirectory, releasePath)}\n`,
  );
}

async function targetCommand(config, argumentsList) {
  const action = argumentsList[0] ?? 'list';
  if (action === 'list') {
    for (const target of profileTargets(config))
      process.stdout.write(`${target}\n`);
    return;
  }
  if (action === 'show') {
    process.stdout.write(`${resolveTarget(config, argumentsList.slice(1))}\n`);
    return;
  }
  if (action === 'check') {
    const target = argumentsList[1];
    if (!target) throw new CliError('target check requires an id');
    await typecheck(config, resolveTarget(config, ['--target', target]));
    return;
  }
  throw new CliError(`Unknown target command: ${action}`);
}

async function check(config, argumentsList) {
  const allTargets = argumentsList.includes('--all-targets');
  assert(
    !(allTargets && targetFromArguments(argumentsList)),
    'check --all-targets cannot be combined with --target',
  );
  await format(true);
  await lint();
  if (allTargets) {
    for (const target of profileTargets(config))
      await typecheck(config, target);
  } else {
    await typecheck(config, resolveTarget(config, argumentsList));
  }
  if (allTargets) {
    await testAllTargets(config);
  } else {
    const target = resolveTarget(config, argumentsList);
    await testTarget(config, target);
  }
  await commandApi(['check'], config);
}

async function main() {
  const [command = 'help', ...argumentsList] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const config = await loadConfig();
  if (command === 'doctor')
    return doctor(config, argumentsList.includes('--json'));
  if (command === 'version') {
    const metadata = await readPackageMetadata();
    process.stdout.write(`${metadata.name} ${metadata.version}\n`);
    process.stdout.write(
      `Node ${process.versions.node}; default SealDice ${config.sealDice.defaultTarget}\n`,
    );
    return;
  }
  if (command === 'api') return commandApi(argumentsList, config);
  if (command === 'target') return targetCommand(config, argumentsList);
  const packageManager = await resolvePackageManager(config);
  if (command === 'install')
    return installDependencies(
      packageManager,
      argumentsList.includes('--update-lock'),
      process.env.SEAL_OFFLINE === '1',
    );
  if (command === 'deps') {
    const [action, ...dependencyArguments] = argumentsList;
    if (!action) throw new CliError('deps requires an action');
    return dependencyCommand(
      packageManager,
      action,
      dependencyArguments.filter((value) => value !== '--dev'),
      dependencyArguments.includes('--dev'),
    );
  }
  if (command === 'fmt') return format(argumentsList.includes('--check'));
  if (command === 'lint') return lint();
  if (command === 'typecheck')
    return typecheck(config, resolveTarget(config, argumentsList));
  if (command === 'test') return test(config, argumentsList);
  if (command === 'check') return check(config, argumentsList);
  if (command === 'build')
    return build(config, resolveTarget(config, argumentsList));
  if (command === 'watch') {
    const target = resolveTarget(config, argumentsList);
    await typecheck(config, target);
    const { watchBundle } = await import('../tasks/build.mjs');
    return watchBundle({ config, target });
  }
  if (command === 'package')
    return packageArtifact(config, resolveTarget(config, argumentsList));
  if (command === 'clean') {
    assert(
      !targetFromArguments(argumentsList),
      'clean does not accept --target',
    );
    for (const directory of ['dev', 'dist', 'release', '.seal/cache']) {
      await removeKnownDirectory(rootDirectory, directory);
    }
    process.stdout.write('Removed generated outputs.\n');
    return;
  }
  throw new CliError(`Unknown command: ${command}`);
}

try {
  await main();
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`sealw: ${error.message}\n`);
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 3;
  }
}
