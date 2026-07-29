import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliError } from '../cli/lib/errors.mjs';
import { fromRoot } from '../cli/lib/paths.mjs';
import { run, runChecked } from '../cli/lib/process.mjs';
import { profileForTarget } from '../cli/lib/target.mjs';

const bundleLoadTimeoutSeconds = 5;

const bundleHarness = `package dice

import (
  "os"
  "reflect"
  "testing"
  "time"

  "go.uber.org/zap"
)

func setOptionalField(target any, name string, value any) {
  field := reflect.ValueOf(target).Elem().FieldByName(name)
  candidate := reflect.ValueOf(value)
  if field.IsValid() && field.CanSet() && candidate.Type().AssignableTo(field.Type()) {
    field.Set(candidate)
  }
}

func TestSealTemplateBundleRuntime(t *testing.T) {
  bundle := os.Getenv("SEAL_TEMPLATE_BUNDLE")
  extensionID := os.Getenv("SEAL_TEMPLATE_EXTENSION_ID")
  if bundle == "" || extensionID == "" {
    t.Fatal("SEAL_TEMPLATE_BUNDLE and SEAL_TEMPLATE_EXTENSION_ID are required")
  }

  session := &IMSession{ServiceAtNew: new(SyncMap[string, *GroupInfo])}
  d := &Dice{
    AttrsManager: &AttrsManager{},
    BaseConfig: BaseConfig{DataDir: t.TempDir()},
    CocExtraRules: map[int]*CocRuleInfo{},
    ExtLoopManager: NewJsLoopManager(),
    ImSession: session,
    Logger: zap.NewNop().Sugar(),
  }
  setOptionalField(d, "DirtyGroups", new(SyncMap[string, int64]))
  setOptionalField(d, "ExtRegistry", new(SyncMap[string, *ExtInfo]))
  session.Parent = d
  d.JsInit()
  loop := d.ExtLoopManager.GetWebLoop()
  if loop == nil {
    t.Fatal("JsInit did not create an event loop")
  }
  defer func() {
    if d.JsScriptCron != nil {
      d.JsScriptCron.Stop()
    }
    loop.Stop()
    d.ExtLoopManager.SetLoop(nil)
  }()

  script := &JsScriptInfo{Enable: true, Filename: bundle, Name: extensionID}
  loaded := make(chan struct{})
  go func() {
    d.JsLoadScriptRaw(script)
    close(loaded)
  }()
  select {
  case <-loaded:
  case <-time.After(${bundleLoadTimeoutSeconds} * time.Second):
    t.Fatal("[runtime:js-load-timeout] Dice.JsLoadScriptRaw did not return within ${bundleLoadTimeoutSeconds}s; the Core event loop did not complete RequireModule")
  }
  if script.ErrText != "" {
    t.Fatalf("SealDice failed to load bundle: %s", script.ErrText)
  }
  if !script.Enable {
    t.Fatal("SealDice disabled the bundle while loading it")
  }
  if d.ExtFind(extensionID, true) == nil {
    t.Fatalf("bundle did not register extension %q", extensionID)
  }
}
`;

const sealpackHarness = `package sealpack

import (
  "os"
  "testing"
)

func TestSealTemplateArchive(t *testing.T) {
  archive := os.Getenv("SEAL_TEMPLATE_ARCHIVE")
  if archive == "" {
    t.Fatal("SEAL_TEMPLATE_ARCHIVE is required")
  }
  info, err := InspectArchive(archive)
  if err != nil {
    t.Fatalf("InspectArchive rejected the generated package: %v", err)
  }
  if info.Manifest == nil {
    t.Fatal("InspectArchive returned no manifest")
  }
}
`;

function optionValue(argumentsList, option) {
  const index = argumentsList.indexOf(option);
  if (index === -1) return null;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--'))
    throw new CliError(`${option} requires a path`);
  return value;
}

export async function resolveRuntimeCore(argumentsList = []) {
  const configured =
    optionValue(argumentsList, '--core') ??
    process.env.SEAL_CORE_DIR ??
    fromRoot('reference', 'sealdice-core');
  try {
    const stat = await fs.stat(configured);
    if (!stat.isDirectory()) throw new Error('not a directory');
    return await fs.realpath(configured);
  } catch {
    throw new CliError(
      `[runtime:core] SealDice core checkout not found at ${configured}; pass --core <path> or initialize reference/sealdice-core`,
      4,
    );
  }
}

export function exactRuntimeTargets(config, target) {
  const profile = profileForTarget(config, target);
  if (profile.kind === 'exact') return [profile];
  return profile.members.map((member) => profileForTarget(config, member));
}

async function assertCoreCommit(core, commit, target) {
  const result = await run(
    'git',
    ['-C', core, 'rev-parse', '--verify', `${commit}^{commit}`],
    { capture: true },
  );
  if (result.code === 0) return;
  throw new CliError(
    `[runtime:core-commit] Core checkout does not contain runtimeCoreCommit ${commit} for ${target}; fetch that exact commit before running runtime verification`,
    4,
  );
}

async function withCoreWorktree(core, profile, callback) {
  await assertCoreCommit(core, profile.runtimeCoreCommit, profile.id);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-runtime-'));
  const worktree = path.join(temporary, 'core');
  let added = false;
  try {
    await runChecked(
      'git',
      [
        '-C',
        core,
        'worktree',
        'add',
        '--detach',
        worktree,
        profile.runtimeCoreCommit,
      ],
      { capture: true },
    );
    added = true;
    return await callback(worktree);
  } finally {
    if (added)
      await run(
        'git',
        ['-C', core, 'worktree', 'remove', '--force', worktree],
        {
          capture: true,
        },
      );
    await fs.rm(temporary, { force: true, recursive: true });
  }
}

async function ensureEmbedDirectory(core, relative) {
  const directory = path.join(core, relative);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'seal-template-runtime-placeholder.txt'),
    'runtime verification placeholder\n',
  );
}

export function classifyRuntimeFailure(output, category = 'bundle') {
  if (category === 'sealpack') return 'sealpack-inspection';
  if (output.includes('[runtime:js-load-timeout]')) return 'js-load-timeout';
  if (output.includes('JsInit did not create an event loop'))
    return 'host-init';
  if (
    output.includes('SealDice failed to load bundle') ||
    output.includes('disabled the bundle while loading')
  ) {
    return 'goja-load';
  }
  if (output.includes('bundle did not register extension'))
    return 'extension-register';
  return 'goja-runtime';
}

async function runRuntimeCommand(command, argumentsList, options, category) {
  let result;
  try {
    result = await run(command, argumentsList, {
      ...options,
      capture: true,
    });
  } catch (error) {
    throw new CliError(
      `[runtime:${category}] Could not start ${command}: ${error.message}`,
      5,
    );
  }
  if (result.code === 0) return;
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const phase = classifyRuntimeFailure(output, category);
  throw new CliError(
    `[runtime:${phase}] ${command} exited with ${result.code}.${output ? `\n${output}` : ''}`,
    5,
  );
}

async function runBundleHarness(core, bundlePath, extensionID) {
  await ensureEmbedDirectory(core, 'static/frontend');
  await ensureEmbedDirectory(core, 'static/scripts');
  await fs.writeFile(
    path.join(core, 'dice', 'zz_seal_template_runtime_test.go'),
    bundleHarness,
  );
  await runRuntimeCommand(
    'go',
    [
      'test',
      './dice',
      '-run',
      '^TestSealTemplateBundleRuntime$',
      '-count=1',
      '-timeout',
      `${bundleLoadTimeoutSeconds + 25}s`,
    ],
    {
      cwd: core,
      env: {
        SEAL_TEMPLATE_BUNDLE: path.resolve(bundlePath),
        SEAL_TEMPLATE_EXTENSION_ID: extensionID,
      },
    },
    'bundle',
  );
}

async function runSealpackHarness(core, archivePath) {
  await fs.writeFile(
    path.join(core, 'dice', 'sealpack', 'zz_seal_template_archive_test.go'),
    sealpackHarness,
  );
  await runRuntimeCommand(
    'go',
    [
      'test',
      './dice/sealpack',
      '-run',
      '^TestSealTemplateArchive$',
      '-count=1',
    ],
    {
      cwd: core,
      env: { SEAL_TEMPLATE_ARCHIVE: path.resolve(archivePath) },
    },
    'sealpack',
  );
}

export async function verifyBundleRuntime({
  config,
  core,
  extensionID,
  bundlePath,
  target,
}) {
  for (const profile of exactRuntimeTargets(config, target)) {
    await withCoreWorktree(core, profile, (worktree) =>
      runBundleHarness(worktree, bundlePath, extensionID),
    );
    process.stdout.write(
      `SealDice goja runtime accepted ${path.basename(bundlePath)} for ${profile.id}.\n`,
    );
  }
}

export async function inspectSealpackArchive({
  config,
  core,
  archivePath,
  target,
}) {
  const profile = profileForTarget(config, target);
  if (profile.kind !== 'exact')
    throw new CliError('sealpack inspection requires an exact SealDice target');
  await withCoreWorktree(core, profile, (worktree) =>
    runSealpackHarness(worktree, archivePath),
  );
  process.stdout.write(
    `SealDice InspectArchive accepted ${path.basename(archivePath)} for ${target}.\n`,
  );
}
