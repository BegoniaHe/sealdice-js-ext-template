import assert from 'node:assert/strict';
import test from 'node:test';

import { runTaskGraph } from '../tools/tasks/graph.mjs';

test('task graph runs dependencies once before requested tasks', async () => {
  const order = [];
  const results = await runTaskGraph(
    {
      bundle: {
        dependencies: ['typecheck'],
        run: ({ results: completed }) => {
          order.push('bundle');
          return `${completed.get('typecheck')}-bundle`;
        },
      },
      package: {
        dependencies: ['bundle', 'typecheck'],
        run: ({ results: completed }) => {
          order.push('package');
          return `${completed.get('bundle')}-package`;
        },
      },
      typecheck: {
        run: () => {
          order.push('typecheck');
          return 'types';
        },
      },
    },
    ['package'],
  );

  assert.deepEqual(order, ['typecheck', 'bundle', 'package']);
  assert.equal(results.get('package'), 'types-bundle-package');
});

test('task graph rejects dependency cycles', async () => {
  await assert.rejects(
    () =>
      runTaskGraph(
        {
          first: { dependencies: ['second'], run: () => {} },
          second: { dependencies: ['first'], run: () => {} },
        },
        ['first'],
      ),
    /dependency cycle/,
  );
});
