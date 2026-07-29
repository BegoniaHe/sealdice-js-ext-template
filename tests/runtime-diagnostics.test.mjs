import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRuntimeFailure } from '../tools/runtime/core.mjs';

test('runtime failures identify the actionable verification phase', () => {
  assert.equal(
    classifyRuntimeFailure('SealDice failed to load bundle: ReferenceError'),
    'goja-load',
  );
  assert.equal(
    classifyRuntimeFailure('bundle did not register extension "demo"'),
    'extension-register',
  );
  assert.equal(
    classifyRuntimeFailure(
      'InspectArchive rejected the generated package',
      'sealpack',
    ),
    'sealpack-inspection',
  );
});
