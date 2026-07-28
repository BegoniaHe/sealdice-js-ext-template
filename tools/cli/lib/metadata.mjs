import { CliError, assert } from './errors.mjs';
import { readJson } from './files.mjs';
import { fromRoot } from './paths.mjs';

const metadataFile = fromRoot('extension.json');
const identifierPattern = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const versionPattern =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const templateValues = new Set([
  'sealdice-js-ext-template',
  'SealDice JavaScript Extension Template',
  'Template Author',
  'https://github.com/sealdice/sealdice-js-ext-template',
]);

function stringValue(metadata, field) {
  const value = metadata[field];
  assert(
    typeof value === 'string' && value.trim().length > 0,
    `extension.json requires a non-empty ${field}`,
    3,
  );
  assert(
    !/[\r\n]/.test(value),
    `extension.json ${field} must be a single line`,
    3,
  );
  return value;
}

export function validateExtensionMetadata(metadata, { release = false } = {}) {
  assert(
    metadata && typeof metadata === 'object' && !Array.isArray(metadata),
    'extension.json must be an object',
    3,
  );
  const normalized = {
    author: stringValue(metadata, 'author'),
    description: stringValue(metadata, 'description'),
    homepageUrl: stringValue(metadata, 'homepageUrl'),
    id: stringValue(metadata, 'id'),
    license: stringValue(metadata, 'license'),
    name: stringValue(metadata, 'name'),
    version: stringValue(metadata, 'version'),
  };
  assert(
    identifierPattern.test(normalized.id),
    'extension.json id must be 3-64 lowercase letters, digits, or hyphens',
    3,
  );
  assert(
    versionPattern.test(normalized.version),
    'extension.json version must be a semantic version',
    3,
  );
  try {
    const url = new URL(normalized.homepageUrl);
    assert(
      url.protocol === 'https:' || url.protocol === 'http:',
      'extension.json homepageUrl must use http or https',
      3,
    );
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('extension.json homepageUrl must be a valid URL', 3);
  }
  if (release) {
    for (const [field, value] of Object.entries(normalized)) {
      assert(
        !templateValues.has(value),
        `extension.json ${field} still has a template value; replace it before packaging`,
        3,
      );
    }
  }
  return normalized;
}

export async function loadExtensionMetadata(options) {
  return validateExtensionMetadata(await readJson(metadataFile), options);
}

export function renderUserscriptHeader(metadata) {
  const value = validateExtensionMetadata(metadata);
  return [
    '// ==UserScript==',
    `// @name         ${value.name}`,
    `// @author       ${value.author}`,
    `// @version      ${value.version}`,
    `// @description  ${value.description}`,
    `// @license      ${value.license}`,
    `// @homepageURL  ${value.homepageUrl}`,
    '// ==/UserScript==',
    '',
  ].join('\n');
}

export function artifactName(metadata) {
  const value = validateExtensionMetadata(metadata, { release: true });
  return `${value.id}-${value.version}.js`;
}
