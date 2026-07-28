import assert from 'node:assert/strict';
import test from 'node:test';

import { runtimePolicyViolations } from '../tools/tasks/runtime-policy.mjs';

test('runtime policy rejects unsupported free globals', () => {
  assert.deepEqual(
    runtimePolicyViolations(
      'const request = new Headers(); new Request("https://example.invalid"); process.exit(1);',
    ),
    ['Headers', 'Request', 'process'],
  );
});

test('runtime policy ignores local bindings and honors reviewed exceptions', () => {
  assert.deepEqual(
    runtimePolicyViolations('const URL = class {}; new URL();'),
    [],
  );
  assert.deepEqual(
    runtimePolicyViolations('globalThis.URL.createObjectURL(value);', ['URL']),
    [],
  );
});

test('runtime policy rejects Node built-in imports', () => {
  assert.deepEqual(
    runtimePolicyViolations('import fs from "node:fs"; void fs;', ['node:fs']),
    ['node:fs'],
  );
  assert.deepEqual(
    runtimePolicyViolations('void import("node:fs/promises");'),
    ['node:fs/promises'],
  );
});
