import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  removeKnownDirectory,
  sha256,
  stableJson,
} from '../tools/cli/lib/files.mjs';
import { findTestFiles } from '../tools/cli/lib/test-files.mjs';

test('stable JSON ordering and hashes are deterministic', () => {
  assert.equal(
    stableJson({ z: 1, a: { y: true, b: false } }),
    '{\n  "a": {\n    "b": false,\n    "y": true\n  },\n  "z": 1\n}\n',
  );
  assert.equal(sha256('seal'), sha256('seal'));
});

test('clean helper only removes documented generated directories', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sealw-clean-test-'));
  try {
    await fs.mkdir(path.join(root, 'dev'));
    await fs.writeFile(path.join(root, 'dev', 'artifact'), 'generated');
    await removeKnownDirectory(root, 'dev');
    await assert.rejects(() => fs.access(path.join(root, 'dev')));
    await assert.rejects(() => removeKnownDirectory(root, '..'));
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});

test('test discovery includes nested native JavaScript and TypeScript tests', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sealw-test-files-'));
  try {
    await fs.mkdir(path.join(root, 'nested'));
    await fs.writeFile(path.join(root, 'root.test.mjs'), '');
    await fs.writeFile(path.join(root, 'nested', 'child.test.mjs'), '');
    await fs.writeFile(path.join(root, 'nested', 'child.test.ts'), '');
    await fs.writeFile(path.join(root, 'nested', 'support.mjs'), '');
    assert.deepEqual(
      (await findTestFiles(root)).map((file) => path.relative(root, file)),
      ['nested/child.test.mjs', 'nested/child.test.ts', 'root.test.mjs'],
    );
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});
