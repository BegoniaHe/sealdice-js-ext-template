import assert from 'node:assert/strict';
import test from 'node:test';

import { nameList } from '../src/utils.ts';

void test('native TypeScript tests execute without a test-time transpiler', () => {
  assert.deepEqual(nameList, ['氪豹', '林冲']);
});
