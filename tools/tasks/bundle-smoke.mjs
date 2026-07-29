import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

import { loadExtensionMetadata } from '../cli/lib/metadata.mjs';
import { createMockHost } from '../../tests/support/mock-host.mjs';
import { outputPath } from './build.mjs';

const targetIndex = process.argv.indexOf('--target');
const target = targetIndex === -1 ? '1.5.0' : process.argv[targetIndex + 1];
if (!target) throw new Error('--target requires a profile id');

const config = JSON.parse(
  await fs.readFile(new URL('../../seal.config.json', import.meta.url), 'utf8'),
);
const output = outputPath(config, 'development');
const source = await fs.readFile(output, 'utf8');
assert.match(source, /^\/\/ ==UserScript==\r?\n/, 'missing userscript header');
assert.match(
  source,
  /\/\/ ==\/UserScript==\r?\n/,
  'unterminated userscript header',
);

const host = await createMockHost(target);
try {
  vm.runInNewContext(
    source,
    { Math, seal: host.seal, ...host.globals },
    { filename: output },
  );
} catch (error) {
  const phase = host.events.some(({ kind }) => kind === 'config-register')
    ? 'config-init'
    : 'mock-init';
  const lastEvent = host.lastEvent();
  const trace = lastEvent ? ` Last host call: ${lastEvent.kind}.` : '';
  throw new Error(
    `[runtime:${phase}] Bundle execution failed: ${error.message}.${trace}`,
    { cause: error },
  );
}
const extension = host.extensions.get((await loadExtensionMetadata()).id);
assert.ok(
  extension,
  `[runtime:extension-register] Bundle did not register an extension. Last host call: ${host.lastEvent()?.kind ?? 'none'}.`,
);
assert.equal(typeof extension.cmdMap.seal?.solve, 'function');

let help;
try {
  help = extension.cmdMap.seal.solve({}, {}, { getArgN: () => 'help' });
} catch (error) {
  throw new Error(
    `[runtime:mock-command] Command setup failed: ${error.message}`,
    {
      cause: error,
    },
  );
}
assert.deepEqual(help, { showHelp: true, solved: true });
try {
  extension.cmdMap.seal.solve({}, {}, { getArgN: () => '' });
} catch (error) {
  throw new Error(
    `[runtime:mock-command] Command execution failed: ${error.message}`,
    { cause: error },
  );
}
assert.match(host.replies.at(-1), /你抓到一只海豹/u);
process.stdout.write(`Bundle smoke test passed for ${target}.\n`);
