import assert from 'node:assert/strict';
import test from 'node:test';

import { validateConfig } from '../tools/cli/lib/config.mjs';
import {
  exactTargets,
  profileTargets,
  resolveTarget,
} from '../tools/cli/lib/target.mjs';

function config(profiles, defaultTarget = profiles[0].id) {
  return {
    build: {
      bundleFileName: 'extension.js',
      ecmaTarget: 'es6',
      entry: 'src/index.ts',
    },
    packageManager: 'npm',
    release: {
      checksum: 'sha256',
      defaultFormats: ['js'],
      directory: 'release',
    },
    runtime: { allowedGlobals: [] },
    schemaVersion: 3,
    sealDice: { defaultTarget, profiles },
    sealpack: {
      assets: [],
      authors: [],
      dependencies: {},
      keywords: [],
      minSealDice: '1.6.0',
      packageId: 'alice/demo',
      permissions: {
        dangerous: false,
        fileRead: [],
        fileWrite: [],
        httpServer: false,
        ipc: [],
        acknowledgeUnrestrictedNetwork: false,
        network: false,
        networkHosts: [],
      },
      readme: 'README.md',
      repository: '',
      scriptPath: 'scripts/extension.js',
      store: { banner: '', category: 'tool', icon: '', screenshots: [] },
    },
  };
}

function exact(id, suffix) {
  return {
    id,
    kind: 'exact',
    runtimeCoreCommit: `${suffix}`.padEnd(40, '0'),
  };
}

test('target registry accepts a future semantic-version profile without code changes', async () => {
  const value = await validateConfig(
    config(
      [
        exact('1.6.0', 'a'),
        exact('1.6.1', 'b'),
        {
          id: 'compat-1.6.x',
          kind: 'compatibility',
          members: ['1.6.0', '1.6.1'],
        },
      ],
      'compat-1.6.x',
    ),
  );
  assert.deepEqual(exactTargets(value), ['1.6.0', '1.6.1']);
  assert.deepEqual(profileTargets(value), ['1.6.0', '1.6.1', 'compat-1.6.x']);
  assert.equal(resolveTarget(value, []), 'compat-1.6.x');
});

test('target registry rejects unregistered or unordered compatibility members', async () => {
  await assert.rejects(() =>
    validateConfig(
      config([
        exact('1.7.0', 'c'),
        {
          id: 'compat-1.7.x',
          kind: 'compatibility',
          members: ['1.7.0', '1.6.0'],
        },
      ]),
    ),
  );
});

test('unrestricted network access requires explicit acknowledgement', async () => {
  const value = config([exact('1.6.0', 'd')]);
  value.sealpack.permissions.network = true;
  await assert.rejects(() => validateConfig(value), /acknowledge/);

  value.sealpack.permissions.acknowledgeUnrestrictedNetwork = true;
  await assert.doesNotReject(() => validateConfig(value));

  value.sealpack.permissions.networkHosts = ['*'];
  await assert.rejects(() => validateConfig(value), /does not support \*/);
});

test('sealpack assets cannot create unsupported archive root entries', async () => {
  const value = config([exact('1.6.0', 'e')]);
  value.sealpack.assets = ['LICENSE'];
  await assert.rejects(() => validateConfig(value), /stay under assets/);
});
