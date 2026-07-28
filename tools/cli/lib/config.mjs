import fs from 'node:fs/promises';
import path from 'node:path';

import { CliError, assert } from './errors.mjs';
import { readJson } from './files.mjs';
import { configPath, rootDirectory } from './paths.mjs';

const supportedTargets = new Set(['1.5.0', '1.5.1', '1.6.0']);
const compatibilityTargets = ['1.5.0', '1.5.1'];

function validateConfig(config) {
  assert(
    config && typeof config === 'object',
    'seal.config.json must be an object',
  );
  assert(
    config.schemaVersion === 1,
    'seal.config.json schemaVersion must be 1',
  );
  assert(config.packageManager === 'npm', 'packageManager must be npm');
  assert(
    config.sealDice && typeof config.sealDice === 'object',
    'sealDice configuration is required',
  );
  assert(
    Array.isArray(config.sealDice.targets),
    'sealDice.targets must be an array',
  );
  assert(
    config.sealDice.targets.length === supportedTargets.size &&
      config.sealDice.targets.every((target) => supportedTargets.has(target)),
    'sealDice.targets must contain exactly 1.5.0, 1.5.1 and 1.6.0',
  );
  assert(
    supportedTargets.has(config.sealDice.defaultTarget),
    'sealDice.defaultTarget must be a supported target',
  );
  assert(
    config.sealDice.compatibilityProfile === 'compat-1.5.x',
    'sealDice.compatibilityProfile must be compat-1.5.x',
  );
  assert(
    Array.isArray(config.sealDice.compatibilityTargets) &&
      config.sealDice.compatibilityTargets.length ===
        compatibilityTargets.length &&
      config.sealDice.compatibilityTargets.every(
        (target, index) => target === compatibilityTargets[index],
      ),
    'sealDice.compatibilityTargets must be 1.5.0 and 1.5.1 in order',
  );
  assert(
    config.release && typeof config.release === 'object',
    'release configuration is required',
  );
  assert(
    config.release.directory === 'release',
    'release.directory must be release',
  );
  assert(
    config.release.checksum === 'sha256',
    'release.checksum must be sha256',
  );
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
