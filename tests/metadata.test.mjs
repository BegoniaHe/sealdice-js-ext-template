import assert from 'node:assert/strict';
import test from 'node:test';

import {
  artifactName,
  buildTimestamp,
  renderUserscriptHeader,
  validateExtensionMetadata,
} from '../tools/cli/lib/metadata.mjs';

const metadata = {
  author: 'SealDice Maintainer',
  description: 'A useful extension.',
  homepageUrl: 'https://example.com/sealdice-extension',
  id: 'sealdice-extension',
  license: 'MIT',
  name: 'SealDice Extension',
  version: '1.2.3',
};

test('metadata renders a deterministic userscript header', () => {
  assert.equal(
    renderUserscriptHeader(metadata),
    `// ==UserScript==
// @name         SealDice Extension
// @author       SealDice Maintainer
// @version      1.2.3
// @description  A useful extension.
// @license      MIT
// @homepageURL  https://example.com/sealdice-extension
// ==/UserScript==
`,
  );
  assert.equal(artifactName(metadata), 'sealdice-extension-1.2.3.js');
});

test('build timestamps use SOURCE_DATE_EPOCH for reproducible release headers', () => {
  assert.equal(
    buildTimestamp({ environment: { SOURCE_DATE_EPOCH: '1700000000' } }),
    1_700_000_000,
  );
  assert.equal(buildTimestamp({ environment: {}, now: 4_200 }), 4);
  assert.match(
    renderUserscriptHeader(metadata, { timestamp: 1_700_000_000 }),
    /\/\/ @timestamp {4}1700000000\n/,
  );
  assert.throws(
    () => buildTimestamp({ environment: { SOURCE_DATE_EPOCH: 'tomorrow' } }),
    /SOURCE_DATE_EPOCH/,
  );
});

test('release metadata rejects template values and invalid identifiers', () => {
  assert.throws(
    () =>
      validateExtensionMetadata(
        { ...metadata, author: 'Template Author' },
        { release: true },
      ),
    /template value/,
  );
  assert.throws(
    () => validateExtensionMetadata({ ...metadata, id: 'Invalid_ID' }),
    /id must be/,
  );
  assert.throws(
    () => validateExtensionMetadata({ ...metadata, id: 'x' }),
    /id must be/,
  );
});
