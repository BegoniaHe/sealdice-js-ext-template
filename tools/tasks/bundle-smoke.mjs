import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

import { loadExtensionMetadata } from '../cli/lib/metadata.mjs';
import { createMockHost } from '../../tests/support/mock-host.mjs';
import { outputPath } from './build.mjs';

const targetIndex = process.argv.indexOf('--target');
const target = targetIndex === -1 ? '1.5.0' : process.argv[targetIndex + 1];
if (!target) throw new Error('--target requires a profile id');

const output = outputPath('development');
const source = await fs.readFile(output, 'utf8');
assert.match(source, /^\/\/ ==UserScript==\r?\n/, 'missing userscript header');
assert.match(
  source,
  /\/\/ ==\/UserScript==\r?\n/,
  'unterminated userscript header',
);

const host = await createMockHost(target);
vm.runInNewContext(source, { Math, seal: host.seal }, { filename: output });
const extension = host.extensions.get((await loadExtensionMetadata()).id);
assert.ok(extension, 'bundle did not register an extension');
assert.equal(typeof extension.cmdMap.seal?.solve, 'function');

const help = extension.cmdMap.seal.solve({}, {}, { getArgN: () => 'help' });
assert.deepEqual(help, { showHelp: true, solved: true });
extension.cmdMap.seal.solve({}, {}, { getArgN: () => '' });
assert.match(host.replies.at(-1), /你抓到一只海豹/u);
process.stdout.write(`Bundle smoke test passed for ${target}.\n`);
