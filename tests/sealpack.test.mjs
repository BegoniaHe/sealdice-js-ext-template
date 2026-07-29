import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import test from 'node:test';

import {
  artifactPolicyViolations,
  createZipArchive,
  renderSealpackInfo,
} from '../tools/tasks/sealpack.mjs';

const config = {
  sealpack: {
    authors: ['Alice'],
    dependencies: { 'seal/base': '>=1.0.0' },
    keywords: ['tool'],
    minSealDice: '1.6.0',
    packageId: 'alice/demo',
    permissions: {
      dangerous: false,
      fileRead: [],
      fileWrite: ['_userdata/*'],
      httpServer: false,
      ipc: [],
      network: false,
      networkHosts: [],
    },
    readme: 'README.md',
    repository: 'https://example.com/repository',
    scriptPath: 'scripts/demo.js',
    store: {
      banner: '',
      category: 'tool',
      icon: 'assets/icon.png',
      screenshots: ['assets/shot.png'],
    },
  },
};

const extension = {
  author: 'Ignored because sealpack authors are explicit',
  description: 'A package used for tests.',
  homepageUrl: 'https://example.com/home',
  license: 'MIT',
  name: 'Demo',
  version: '1.2.3',
};

test('artifact policy rejects declared forbidden archive paths and extensions', () => {
  assert.deepEqual(
    artifactPolicyViolations(
      ['README.md', 'assets/icon.png', 'assets/install.sh', 'scripts/demo.js'],
      {
        forbiddenExtensions: ['.png'],
        forbiddenPaths: ['assets/*install*'],
      },
    ),
    [
      { path: 'assets/icon.png', rule: 'extension .png' },
      { path: 'assets/install.sh', rule: 'path assets/*install*' },
    ],
  );
});

function archiveEntries(archive) {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(end, -1, 'ZIP end of central directory is missing');
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const result = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    const compression = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    assert.equal(archive.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const compressedStart =
      localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(
      compressedStart,
      compressedStart + compressedSize,
    );
    result.set(
      name,
      compression === 8 ? inflateRawSync(compressed) : compressed,
    );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

test('sealpack info is deterministic and contains the package contract', () => {
  const info = renderSealpackInfo({ config, extension });
  assert.match(info, /^format_version = "1.0.0"/);
  assert.match(info, /id = "alice\/demo"/);
  assert.match(info, /scripts = \["scripts\/demo.js"\]/);
  assert.match(info, /"seal\/base" = ">=1.0.0"/);
  assert.match(info, /screenshots = \["assets\/shot.png"\]/);
});

test('sealpack ZIP archives are deterministic and preserve UTF-8 paths', async () => {
  const entries = [
    { data: '# Demo\n', path: 'README.md' },
    { data: 'icon', path: 'assets/图标.txt' },
    { data: 'console.log(1);\n', path: 'scripts/demo.js' },
  ];
  const first = await createZipArchive(entries);
  const second = await createZipArchive([...entries].reverse());
  assert.deepEqual(first, second);

  const decoded = archiveEntries(first);
  assert.equal(decoded.get('README.md').toString(), '# Demo\n');
  assert.equal(decoded.get('assets/图标.txt').toString(), 'icon');
  assert.equal(decoded.get('scripts/demo.js').toString(), 'console.log(1);\n');
});
