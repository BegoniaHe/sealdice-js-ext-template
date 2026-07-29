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
import { removeKnownDirectory, sha256, stableJson } from './lib/files.mjs';
import { loadExtensionMetadata } from './lib/metadata.mjs';
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
  testTsconfigForTarget,
  targetFromArguments,
  tsconfigForTarget,
} from './lib/target.mjs';
import { buildBundle, watchBundle } from '../tasks/build.mjs';
import { runTaskGraph } from '../tasks/graph.mjs';
import { createSingleTargetProject } from '../tasks/init.mjs';
import {
  archiveSealpack,
  assertSealpackTarget,
  stageSealpack,
} from '../tasks/sealpack.mjs';
import {
  inspectSealpackArchive,
  resolveRuntimeCore,
  verifyBundleRuntime,
} from '../runtime/core.mjs';
import {
  releaseJavaScriptArtifact,
  writeArtifactChecksums,
  writeReleaseManifest,
} from '../tasks/release.mjs';

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
  package [--format <format>] [--target <id>]
                               Verify then produce js, sealpack, or both release artifacts
  runtime test [--core <path>] [--target <id>|--all-targets]
                               Load the bundle in the matching SealDice goja runtime
  clean                        Remove known generated outputs only
  init --preset single-target --directory <path> --target <id>
                               Create a minimal exact-target project in a new directory

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
  const testTsconfig = await testTsconfigForTarget(config, target);
  await runChecked(tsc, ['--noEmit', '--project', testTsconfig]);
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
  const tasks = {
    typecheck: {
      run: () => typecheck(config, target),
    },
    bundle: {
      dependencies: ['typecheck'],
      run: () => buildBundle({ config, mode, target }),
    },
  };
  const output = (await runTaskGraph(tasks, ['bundle'])).get('bundle');
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

function packageFormats(config, argumentsList) {
  const index = argumentsList.indexOf('--format');
  if (index === -1) return config.release.defaultFormats;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--'))
    throw new CliError('--format requires js, sealpack, or both');
  if (value === 'both') return ['js', 'sealpack'];
  if (value === 'js' || value === 'sealpack') return [value];
  throw new CliError('--format requires js, sealpack, or both');
}

function writeSealpackPermissionSummary(config) {
  const permissions = config.sealpack.permissions;
  if (!permissions.network) {
    process.stdout.write('Sealpack network permission: disabled.\n');
    return;
  }
  if (permissions.networkHosts.length === 0) {
    process.stdout.write(
      'Sealpack network permission: UNRESTRICTED (explicitly acknowledged).\n',
    );
    return;
  }
  process.stdout.write(
    `Sealpack network permission: ${permissions.networkHosts.join(', ')}.\n`,
  );
}

async function runtimeTest(config, argumentsList) {
  const allTargets = argumentsList.includes('--all-targets');
  assert(
    !(allTargets && targetFromArguments(argumentsList)),
    'runtime test --all-targets cannot be combined with --target',
  );
  const core = await resolveRuntimeCore(argumentsList);
  const targets = allTargets
    ? exactTargets(config)
    : [resolveTarget(config, argumentsList)];
  const extension = await loadExtensionMetadata();
  for (const target of targets) {
    const bundlePath = await build(config, target, 'development');
    await verifyBundleRuntime({
      bundlePath,
      config,
      core,
      extensionID: extension.id,
      target,
    });
  }
}

async function packageArtifacts(config, target, formats, argumentsList) {
  const profile = profileForTarget(config, target);
  const releaseDirectory = fromRoot(config.release.directory);
  if (formats.includes('sealpack')) {
    if (profile.kind !== 'exact')
      throw new CliError(
        'sealpack packaging requires an exact SealDice target',
      );
  }
  const extension = await loadExtensionMetadata({ release: true });
  if (formats.includes('sealpack'))
    assertSealpackTarget(config, extension, target);
  const core = await resolveRuntimeCore(argumentsList);
  if (config.runtime.allowedGlobals.length)
    process.stdout.write(
      `Reviewed runtime global exceptions: ${config.runtime.allowedGlobals.join(', ')}.\n`,
    );
  if (formats.includes('sealpack')) writeSealpackPermissionSummary(config);

  const packageTaskNames = formats.map((format) =>
    format === 'sealpack' ? 'inspect:sealpack' : `package:${format}`,
  );
  const tasks = {
    verify: {
      run: () =>
        check(
          config,
          profile.kind === 'compatibility'
            ? ['--all-targets']
            : ['--target', target],
        ),
    },
    bundle: {
      dependencies: ['verify'],
      run: () => buildBundle({ config, mode: 'production', target }),
    },
    runtime: {
      dependencies: ['bundle'],
      run: ({ results }) =>
        verifyBundleRuntime({
          bundlePath: results.get('bundle'),
          config,
          core,
          extensionID: extension.id,
          target,
        }),
    },
    'package:js': {
      dependencies: ['runtime'],
      run: ({ results }) =>
        releaseJavaScriptArtifact({
          bundlePath: results.get('bundle'),
          extension,
          releaseDirectory,
        }),
    },
    'stage:sealpack': {
      dependencies: ['runtime'],
      run: ({ results }) =>
        stageSealpack({
          bundlePath: results.get('bundle'),
          config,
          extension,
        }),
    },
    'package:sealpack': {
      dependencies: ['stage:sealpack'],
      run: ({ results }) =>
        archiveSealpack({
          config,
          extension,
          releaseDirectory,
          stage: results.get('stage:sealpack'),
        }),
    },
    'inspect:sealpack': {
      dependencies: ['package:sealpack'],
      run: async ({ results }) => {
        const archivePath = path.join(
          releaseDirectory,
          results.get('package:sealpack').artifact,
        );
        try {
          await inspectSealpackArchive({
            archivePath,
            config,
            core,
            target,
          });
        } catch (error) {
          await fs.rm(archivePath, { force: true });
          throw error;
        }
      },
    },
    manifest: {
      dependencies: packageTaskNames,
      run: async ({ results }) => {
        const artifacts = formats.map((format) =>
          results.get(`package:${format}`),
        );
        await writeArtifactChecksums({ artifacts, releaseDirectory });
        const apiProfile = JSON.parse(
          await fs.readFile(
            fromRoot('api', 'profiles', `${target}.json`),
            'utf8',
          ),
        );
        return writeReleaseManifest({
          artifacts,
          extension,
          profileHash: `sha256:${sha256(stableJson(apiProfile))}`,
          releaseDirectory,
          target,
        });
      },
    },
  };
  const results = await runTaskGraph(tasks, ['manifest']);
  for (const format of formats) {
    const artifact = results.get(`package:${format}`);
    process.stdout.write(
      `Packaged ${path.relative(rootDirectory, path.join(releaseDirectory, artifact.artifact))}\n`,
    );
  }
}

function requiredOption(argumentsList, option) {
  const index = argumentsList.indexOf(option);
  if (index === -1) throw new CliError(`${option} is required`);
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--'))
    throw new CliError(`${option} requires a value`);
  return value;
}

async function initializeProject(config, argumentsList) {
  const preset = requiredOption(argumentsList, '--preset');
  if (preset !== 'single-target')
    throw new CliError('--preset currently supports only single-target');
  assert(
    !argumentsList.includes('--all-targets'),
    'init does not accept --all-targets',
  );
  const target = resolveTarget(config, argumentsList, {
    allowCompatibility: false,
  });
  const directory = requiredOption(argumentsList, '--directory');
  const output = await createSingleTargetProject({ config, directory, target });
  process.stdout.write(
    `Initialized single-target SealDice ${target} project at ${output}.\n`,
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
  if (command === 'init') return initializeProject(config, argumentsList);
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
  if (command === 'runtime') {
    const [action = 'test', ...runtimeArguments] = argumentsList;
    if (action !== 'test')
      throw new CliError('runtime only supports the test action');
    return runtimeTest(config, runtimeArguments);
  }
  if (command === 'build')
    return build(config, resolveTarget(config, argumentsList));
  if (command === 'watch') {
    const target = resolveTarget(config, argumentsList);
    await typecheck(config, target);
    return watchBundle({ config, target });
  }
  if (command === 'package')
    return packageArtifacts(
      config,
      resolveTarget(config, argumentsList),
      packageFormats(config, argumentsList),
      argumentsList,
    );
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
