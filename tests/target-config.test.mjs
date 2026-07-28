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

test('target registry accepts a future semantic-version profile without code changes', async () => {
  const value = await validateConfig(
    config(
      [
        { id: '1.6.0', kind: 'exact' },
        { id: '1.6.1', kind: 'exact' },
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
        { id: '1.7.0', kind: 'exact' },
        {
          id: 'compat-1.7.x',
          kind: 'compatibility',
          members: ['1.7.0', '1.6.0'],
        },
      ]),
    ),
  );
});
