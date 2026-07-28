import fs from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import semver from 'semver';

import { CliError, assert } from './errors.mjs';
import { readJson } from './files.mjs';
import { configPath, fromRoot, rootDirectory } from './paths.mjs';

let schemaValidator;

async function validateSchema(config) {
  if (!schemaValidator) {
    const schema = await readJson(
      fromRoot('api', 'schema', 'seal.config.schema.json'),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    schemaValidator = ajv.compile(schema);
  }
  if (schemaValidator(config)) return;
  const errors = (schemaValidator.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
  throw new CliError(`seal.config.json does not match its schema: ${errors}`);
}

function assertSafeTypecheckPath(file) {
  assert(
    !path.isAbsolute(file) &&
      !file.split(/[\\/]/u).includes('..') &&
      (file.startsWith('src/') || file.startsWith('tests/')),
    `typecheckInclude must stay under src/ or tests/: ${file}`,
  );
}

function assertSafeProjectPath(file, label, { prefix = null } = {}) {
  const segments = typeof file === 'string' ? file.split(/[\\/]/u) : [];
  assert(
    typeof file === 'string' &&
      file.length > 0 &&
      !path.isAbsolute(file) &&
      !/^[A-Za-z]:/.test(file) &&
      !file.includes('\\') &&
      !segments.some(
        (segment) => !segment || segment === '.' || segment === '..',
      ),
    `${label} must be a non-empty slash-separated project-relative path without .. segments`,
  );
  if (prefix) {
    assert(
      file === prefix || file.startsWith(`${prefix}/`),
      `${label} must stay under ${prefix}/`,
    );
  }
  return file;
}

function assertPackageID(id, label = 'sealpack.packageId') {
  const segments = id.split('/');
  assert(
    segments.length === 2 &&
      segments.every(
        (segment) =>
          /^[\p{L}\p{N}_-]{1,64}$/u.test(segment) &&
          segment !== '.' &&
          segment !== '..',
      ),
    `${label} must use the author/package form with valid segments`,
  );
}

function assertCanonicalVersion(version, label) {
  assert(
    semver.valid(version) === version,
    `${label} must be a canonical semantic version`,
  );
}

function assertSealpackAssetPath(file, label) {
  return assertSafeProjectPath(file, label, { prefix: 'assets' });
}

function validateSealpackConfig(config) {
  const sealpack = config.sealpack;
  assertPackageID(sealpack.packageId);
  assertCanonicalVersion(sealpack.minSealDice, 'sealpack.minSealDice');
  const scriptPath = assertSafeProjectPath(
    sealpack.scriptPath,
    'sealpack.scriptPath',
    { prefix: 'scripts' },
  );
  assert(
    scriptPath.endsWith('.js'),
    'sealpack.scriptPath must point to a JavaScript file',
  );
  assert(
    !['*', '?', '[', ']'].some((character) => scriptPath.includes(character)),
    'sealpack.scriptPath must identify one staged JavaScript file, not a glob',
  );
  assert(
    sealpack.readme === 'README.md',
    'sealpack.readme must be the root README.md file',
  );

  for (const asset of sealpack.assets)
    assertSealpackAssetPath(asset, 'sealpack.assets entry');
  for (const [field, value] of Object.entries({
    'sealpack.store.icon': sealpack.store.icon,
    'sealpack.store.banner': sealpack.store.banner,
  })) {
    if (value) assertSealpackAssetPath(value, field);
  }
  for (const screenshot of sealpack.store.screenshots)
    assertSealpackAssetPath(screenshot, 'sealpack.store.screenshots entry');

  for (const [packageID, constraint] of Object.entries(sealpack.dependencies)) {
    assertPackageID(packageID, 'sealpack.dependencies key');
    assert(
      semver.validRange(constraint) !== null,
      `sealpack dependency ${packageID} has an invalid version range`,
    );
  }
  for (const packageID of sealpack.permissions.ipc)
    if (packageID !== '*')
      assertPackageID(packageID, 'sealpack.permissions.ipc entry');
}

export async function validateConfig(config) {
  await validateSchema(config);
  const buildEntry = assertSafeProjectPath(config.build.entry, 'build.entry', {
    prefix: 'src',
  });
  assert(
    buildEntry.endsWith('.ts'),
    'build.entry must point to a TypeScript source file',
  );
  assert(
    path.basename(config.build.bundleFileName) === config.build.bundleFileName,
    'build.bundleFileName must not contain a directory',
  );
  const profiles = config.sealDice.profiles;
  const ids = new Set();
  const exact = new Map();
  for (const profile of profiles) {
    assert(
      !ids.has(profile.id),
      `Duplicate SealDice profile id: ${profile.id}`,
    );
    ids.add(profile.id);
    if (profile.kind !== 'exact') continue;
    assertCanonicalVersion(profile.id, `Exact profile id ${profile.id}`);
    for (const file of profile.typecheckInclude ?? [])
      assertSafeTypecheckPath(file);
    exact.set(profile.id, profile);
  }
  assert(exact.size > 0, 'At least one exact SealDice profile is required');
  for (const profile of profiles) {
    if (profile.kind !== 'compatibility') continue;
    let previous = null;
    for (const member of profile.members) {
      assert(
        exact.has(member),
        `Compatibility profile ${profile.id} references unknown exact profile: ${member}`,
      );
      assert(
        previous === null || semver.lt(previous, member),
        `Compatibility profile ${profile.id} members must be in ascending semantic-version order`,
      );
      previous = member;
    }
  }
  assert(
    ids.has(config.sealDice.defaultTarget),
    `sealDice.defaultTarget must reference a configured profile: ${config.sealDice.defaultTarget}`,
  );
  validateSealpackConfig(config);
  return config;
}

export async function loadConfig() {
  return validateConfig(await readJson(configPath));
}

export async function lockfileState() {
  const names = ['package-lock.json', 'pnpm-lock.yaml'];
  const values = await Promise.all(
    names.map(async (name) => {
      try {
        await fs.access(path.join(rootDirectory, name));
        return name;
      } catch {
        return null;
      }
    }),
  );
  return values.filter(Boolean);
}

export async function resolvePackageManager(config) {
  const requested = process.env.SEAL_PM;
  if (requested && requested !== config.packageManager) {
    throw new CliError(
      `SEAL_PM=${requested} conflicts with canonical packageManager=${config.packageManager}; migrate explicitly instead`,
    );
  }
  const lockfiles = await lockfileState();
  if (lockfiles.length !== 1) {
    throw new CliError(
      'Exactly one of package-lock.json or pnpm-lock.yaml must exist',
    );
  }
  const expected = 'package-lock.json';
  if (lockfiles[0] !== expected) {
    throw new CliError(
      `${config.packageManager} requires ${expected}, found ${lockfiles[0]}`,
    );
  }
  return config.packageManager;
}

export async function readPackageMetadata() {
  return readJson(path.join(rootDirectory, 'package.json'));
}
