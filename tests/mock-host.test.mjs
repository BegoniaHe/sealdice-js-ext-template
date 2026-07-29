import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockHost } from './support/mock-host.mjs';

const targets = process.env.SEAL_TEST_TARGET
  ? [process.env.SEAL_TEST_TARGET]
  : ['1.5.0', '1.5.1'];

for (const target of targets) {
  test(`mock host exposes every profile function for ${target}`, async () => {
    const host = await createMockHost(target);
    const missing = host.profile.entries
      .filter((entry) => entry.kind === 'function')
      .map((entry) => ({
        entry,
        value: entry.path
          .split('.')
          .slice(1)
          .reduce((current, key) => current?.[key], host.seal),
      }))
      .filter(({ value }) => typeof value !== 'function')
      .map(({ entry }) => entry.path);

    assert.deepEqual(missing, []);
  });

  test(`mock host captures extension activity for ${target}`, async () => {
    const host = await createMockHost(target);
    const extension = host.seal.ext.new('mock-test', 'author', '1.0.0');
    extension.cmdMap.mock = { solve: () => ({ solved: true }) };
    host.seal.ext.register(extension);
    host.seal.ext.registerStringConfig(
      extension,
      'title',
      'default',
      'description',
    );
    host.seal.ext.registerTemplateConfig(
      extension,
      'lines',
      ['one'],
      'description',
    );
    const task = host.seal.ext.registerTask(
      extension,
      'daily',
      '08:30',
      () => {},
    );
    host.seal.vars.strSet({}, '$tTitle', 'SealDice');
    host.seal.replyToSender({}, {}, 'reply');
    extension.storageSet('key', 'value');

    assert.equal(host.extensions.get('mock-test'), extension);
    assert.equal(host.config[0].type, 'string');
    assert.equal(host.config[1].type, 'template');
    assert.equal(typeof extension.cmdMap.mock.solve, 'function');
    assert.equal(extension.storageGet('key'), 'value');
    assert.deepEqual(host.seal.vars.strGet({}, '$tTitle'), ['SealDice', true]);
    assert.equal(host.replies[0], 'reply');
    assert.deepEqual(host.messages[0].channel, 'sender');
    assert.equal(task.off(), false);
    assert.equal(task.on(), true);
    assert.equal(host.seal.format({}, 'text'), 'text');
    host.seal.gameSystem.newTemplate('{}');
    assert.deepEqual(host.gameSystems, [{ data: '{}', format: 'json' }]);
    assert.equal(host.lastEvent().kind, 'message-reply');
  });
}

test('mock host uses each profile arity and captures 1.6.0 config groups', async () => {
  const legacy = await createMockHost('1.5.1');
  const current = await createMockHost('1.6.0');
  const extension = current.seal.ext.new('group-test', 'author', '1.0.0');

  current.seal.ext.registerStringConfig(
    extension,
    'title',
    'default',
    'description',
    'Appearance',
  );
  current.seal.ext.registerTask(
    extension,
    'daily',
    '08:30',
    () => {},
    'daily-reminder',
    'description',
    'Schedules',
  );

  assert.equal(legacy.seal.ext.registerStringConfig.length, 4);
  assert.equal(legacy.seal.ext.registerTask.length, 6);
  assert.equal(current.seal.ext.registerStringConfig.length, 5);
  assert.equal(current.seal.ext.registerTask.length, 7);
  assert.equal(current.config[0].group, 'Appearance');
  assert.equal(current.tasks[0].group, 'Schedules');
});

test('mock host provides controllable time, task execution, and cleanup assertions', async () => {
  const host = await createMockHost('1.6.0', { now: 1_000 });
  const extension = host.seal.ext.new('session-test', 'author', '1.0.0');
  const events = [];
  host.clock.setTimeout(() => events.push(`timeout:${host.clock.now}`), 25);
  const interval = host.clock.setInterval(
    () => events.push(`interval:${host.clock.now}`),
    10,
  );
  host.clock.advanceBy(25);
  host.clock.clearInterval(interval);
  host.clock.assertNoPending();

  host.seal.ext.registerStringConfig(
    extension,
    'title',
    'default',
    'description',
  );
  host.setConfig(extension, 'title', 'changed');
  assert.equal(host.seal.ext.getStringConfig(extension, 'title'), 'changed');

  host.seal.ext.registerTask(
    extension,
    'daily',
    '08:30',
    (context) => events.push(`task:${context.now}`),
    'session-cleanup',
  );
  host.runTask('session-cleanup');
  assert.deepEqual(events, [
    'interval:1010',
    'interval:1020',
    'timeout:1025',
    'task:1025',
  ]);
  assert.throws(() => host.assertNoActiveTasks(), /session-cleanup/);
  host.tasks[0].task.off();
  assert.doesNotThrow(() => host.assertNoActiveTasks());
});
