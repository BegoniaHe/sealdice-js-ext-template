import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boolean,
  definePluginConfig,
  integer,
  option,
  string,
  template,
} from '../src/config.ts';
import { createMockHost } from './support/mock-host.mjs';

test('plugin config declarations register, read, validate, and document settings', async () => {
  const host = await createMockHost('1.6.0');
  Object.assign(globalThis, { seal: host.seal });
  const settings = definePluginConfig({
    enabled: boolean({
      default: true,
      description: 'Enable reminders.',
      group: 'Session',
    }),
    interval: integer({
      default: 30,
      description: 'Minutes between reminders.',
      group: 'Session',
      max: 120,
      min: 5,
    }),
    mode: option({
      default: 'gentle',
      description: 'Reminder tone.',
      options: ['gentle', 'urgent'],
    }),
    title: string({ default: 'Seal', description: 'Display title.' }),
    lines: template({ default: ['Hello'], description: 'Reply lines.' }),
  });
  const extension = host.seal.ext.new('config-test', 'author', '1.0.0');
  settings.register(extension);
  host.setConfig(extension, 'interval', 3);
  host.setConfig(extension, 'mode', 'invalid');

  const result = settings.read(extension);
  assert.deepEqual(result.values, {
    enabled: true,
    interval: 30,
    lines: ['Hello'],
    mode: 'gentle',
    title: 'Seal',
  });
  assert.deepEqual(
    result.issues.map((issue) => issue.key),
    ['interval', 'mode'],
  );
  assert.equal(host.config[0].group, 'Session');
  assert.match(
    settings.markdown(),
    /\| interval \| int \| 30 \| min 5, max 120/,
  );
  assert.equal(settings.validate(result.values).length, 0);
});
