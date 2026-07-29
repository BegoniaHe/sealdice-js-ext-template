import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../tools/cli/lib/config.mjs';
import {
  createSingleTargetProject,
  renderSingleTargetReadme,
  singleTargetConfig,
} from '../tools/tasks/init.mjs';

test('single-target preset retains one exact profile and target-specific commands', async () => {
  const config = await loadConfig();
  const single = singleTargetConfig(config, '1.6.0');
  assert.deepEqual(
    single.sealDice.profiles.map(({ id }) => id),
    ['1.6.0'],
  );
  assert.equal(single.sealDice.defaultTarget, '1.6.0');
  assert.match(renderSingleTargetReadme('1.6.0'), /--target 1.6.0/);
  assert.throws(
    () => singleTargetConfig(config, 'compat-1.5.x'),
    /exact SealDice target/,
  );
});

test('single-target preset creates a minimal project in a new directory', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'sealw-init-'));
  const directory = path.join(temporary, 'extension');
  try {
    const output = await createSingleTargetProject({
      config: await loadConfig(),
      directory,
      target: '1.6.0',
    });
    const generatedConfig = JSON.parse(
      await fs.readFile(path.join(output, 'seal.config.json'), 'utf8'),
    );
    const generatedPackage = JSON.parse(
      await fs.readFile(path.join(output, 'package.json'), 'utf8'),
    );
    assert.deepEqual(
      generatedConfig.sealDice.profiles.map(({ id }) => id),
      ['1.6.0'],
    );
    assert.equal(
      generatedPackage.scripts.check,
      './sealw check --target 1.6.0',
    );
    await fs.access(path.join(output, 'api', 'profiles', '1.6.0.json'));
    await assert.rejects(() =>
      fs.access(path.join(output, 'tests', 'init.test.mjs')),
    );
    await assert.rejects(() =>
      fs.access(path.join(output, 'api', 'profiles', '1.5.0.json')),
    );
    await assert.rejects(() => fs.access(path.join(output, 'reference')));
  } finally {
    await fs.rm(temporary, { force: true, recursive: true });
  }
});
