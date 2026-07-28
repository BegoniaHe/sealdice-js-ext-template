import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliError } from '../cli/lib/errors.mjs';
import { readJson, stableJson } from '../cli/lib/files.mjs';
import { fromRoot } from '../cli/lib/paths.mjs';
import { run } from '../cli/lib/process.mjs';

const probeTest = `package dice

import (
  "encoding/json"
  "os"
  "reflect"
  "testing"
  "github.com/dop251/goja"
  "go.uber.org/zap"
)

type runtimeMember struct {
  Arity int
  GoSignature string
  Kind string
  Path string
}

func collectRuntimeMembers(vm *goja.Runtime, object *goja.Object, prefix string, output *[]runtimeMember) {
  for _, key := range object.Keys() {
    value := object.Get(key)
    memberPath := prefix + "." + key
    if _, ok := goja.AssertFunction(value); ok {
      signature := ""
      if exported := value.Export(); exported != nil { signature = reflect.TypeOf(exported).String() }
      *output = append(*output, runtimeMember{Arity: int(value.ToObject(vm).Get("length").ToInteger()), GoSignature: signature, Kind: "function", Path: memberPath})
      continue
    }
    child := value.ToObject(vm)
    if child != nil {
      *output = append(*output, runtimeMember{Kind: "object", Path: memberPath})
      collectRuntimeMembers(vm, child, memberPath, output)
    }
  }
}

func TestSealTemplateRuntimeProbe(t *testing.T) {
  output := os.Getenv("SEAL_API_PROBE_OUTPUT")
  if output == "" { t.Fatal("SEAL_API_PROBE_OUTPUT is required") }
  session := &IMSession{ServiceAtNew: new(SyncMap[string, *GroupInfo])}
  d := &Dice{AttrsManager: &AttrsManager{}, BaseConfig: BaseConfig{DataDir: t.TempDir()}, CocExtraRules: map[int]*CocRuleInfo{}, ExtLoopManager: NewJsLoopManager(), ImSession: session, Logger: zap.NewNop().Sugar()}
  session.Parent = d
  d.JsInit()
  loop := d.ExtLoopManager.GetWebLoop()
  if loop == nil { t.Fatal("JsInit did not create an event loop") }
  defer func() {
    if d.JsScriptCron != nil { d.JsScriptCron.Stop() }
    loop.Stop()
    d.ExtLoopManager.SetLoop(nil)
  }()
  done := make(chan error, 1)
  loop.RunOnLoop(func(vm *goja.Runtime) {
    members := []runtimeMember{}
    collectRuntimeMembers(vm, vm.Get("seal").ToObject(vm), "seal", &members)
    data, err := json.Marshal(members)
    if err != nil { done <- err; return }
    done <- os.WriteFile(output, data, 0600)
  })
  if err := <-done; err != nil { t.Fatal(err) }
}
`;

function normalizedGoSignature(signature) {
  return signature
    .replace(/dice\./g, '')
    .replace(
      /([,(]\s*)([A-Za-z_][A-Za-z0-9_]*)\s+(?=(?:\.\.\.)?(?:\*|\[|map\[|func\(|interface\{|[A-Za-z_]))/g,
      '$1',
    )
    .replace(/\s+/g, '');
}

async function ensureEmbedDirectory(copy, relative) {
  const directory = path.join(copy, relative);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'seal-template-probe-placeholder.txt'),
    'probe\n',
  );
}

export async function probeRuntime({ core, target }) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-api-probe-'));
  const copy = path.join(temporary, 'core');
  const output = path.join(temporary, 'runtime.json');
  try {
    await fs.cp(path.resolve(core), copy, {
      dereference: false,
      recursive: true,
    });
    await ensureEmbedDirectory(copy, 'static/frontend');
    await ensureEmbedDirectory(copy, 'static/scripts');
    await fs.writeFile(
      path.join(copy, 'dice', 'zz_seal_template_probe_test.go'),
      probeTest,
    );
    const result = await run(
      'go',
      ['test', './dice', '-run', '^TestSealTemplateRuntimeProbe$', '-count=1'],
      {
        capture: true,
        cwd: copy,
        env: { SEAL_API_PROBE_OUTPUT: output },
      },
    );
    if (result.code !== 0) {
      throw new CliError(
        `goja runtime probe could not run against this core copy:\n${result.stdout}${result.stderr}`,
        5,
      );
    }
    const runtime = JSON.parse(await fs.readFile(output, 'utf8'))
      .map((entry) => ({
        arity: entry.Arity,
        goSignature: entry.GoSignature,
        kind: entry.Kind,
        path: entry.Path,
      }))
      .sort((first, second) => first.path.localeCompare(second.path));
    const profile = await readJson(
      fromRoot('api', 'profiles', `${target}.json`),
    );
    const profileEntries = new Map(
      profile.entries.map((entry) => [entry.path, entry]),
    );
    const runtimeEntries = new Map(runtime.map((entry) => [entry.path, entry]));
    const profilePaths = new Set(profileEntries.keys());
    const runtimePaths = new Set(runtimeEntries.keys());
    const missing = [...profilePaths].filter(
      (memberPath) => !runtimePaths.has(memberPath),
    );
    const unexpected = [...runtimePaths].filter(
      (memberPath) => !profilePaths.has(memberPath),
    );
    const arityMismatches = [];
    const kindMismatches = [];
    const signatureMismatches = [];
    for (const memberPath of profilePaths) {
      const profileEntry = profileEntries.get(memberPath);
      const runtimeEntry = runtimeEntries.get(memberPath);
      if (!runtimeEntry) continue;
      if (profileEntry.kind !== runtimeEntry.kind)
        kindMismatches.push(memberPath);
      if (
        profileEntry.kind === 'function' &&
        (profileEntry.arity ?? 0) !== runtimeEntry.arity
      ) {
        arityMismatches.push(memberPath);
      }
      if (
        profileEntry.goSignature &&
        runtimeEntry.goSignature &&
        normalizedGoSignature(profileEntry.goSignature) !==
          normalizedGoSignature(runtimeEntry.goSignature)
      ) {
        signatureMismatches.push(memberPath);
      }
    }
    const report = {
      arityMismatches,
      kindMismatches,
      missing,
      runtime,
      signatureMismatches,
      target,
      unexpected,
    };
    process.stdout.write(`${stableJson(report)}`);
    if (
      missing.length ||
      unexpected.length ||
      arityMismatches.length ||
      kindMismatches.length ||
      signatureMismatches.length
    ) {
      throw new CliError(
        'goja runtime probe does not match the checked-in profile',
        4,
      );
    }
  } finally {
    await fs.rm(temporary, { force: true, recursive: true });
  }
}
