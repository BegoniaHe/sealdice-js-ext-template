import { CliError } from './errors.mjs';
import { writeJsonAtomic } from './files.mjs';
import { fromRoot } from './paths.mjs';

export function profileTargets(config) {
  return config.sealDice.profiles.map((profile) => profile.id);
}

export function exactTargets(config) {
  return config.sealDice.profiles
    .filter((profile) => profile.kind === 'exact')
    .map((profile) => profile.id);
}

export function compatibilityProfiles(config) {
  return config.sealDice.profiles.filter(
    (profile) => profile.kind === 'compatibility',
  );
}

export function profileForTarget(config, target) {
  const profile = config.sealDice.profiles.find(
    (candidate) => candidate.id === target,
  );
  if (!profile) throw new CliError(`Unknown SealDice target: ${target}`);
  return profile;
}

export function targetFromArguments(argumentsList) {
  const index = argumentsList.indexOf('--target');
  if (index === -1) {
    return null;
  }
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) {
    throw new CliError('--target requires an id');
  }
  return value;
}

export function resolveTarget(
  config,
  argumentsList,
  { allowCompatibility = true } = {},
) {
  const target =
    targetFromArguments(argumentsList) ??
    process.env.SEAL_TARGET ??
    config.sealDice.defaultTarget;
  const profile = profileForTarget(config, target);
  if (!allowCompatibility && profile.kind !== 'exact')
    throw new CliError(
      `An exact SealDice target is required, received: ${target}`,
    );
  return target;
}

export async function tsconfigForTarget(config, target) {
  const profile = profileForTarget(config, target);
  const include = [
    '../../src/**/*.ts',
    '../../tests/seal-api-contract.ts',
    `../../types/profiles/${profile.id}/seal.d.ts`,
    ...(profile.typecheckInclude ?? []).map((file) => `../../${file}`),
  ];
  const file = fromRoot('.seal', 'cache', `tsconfig.${profile.id}.json`);
  await writeJsonAtomic(file, {
    extends: '../../tsconfig.base.json',
    include,
  });
  return file;
}
