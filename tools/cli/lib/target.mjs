import { CliError } from './errors.mjs';

export const compatibilityTarget = 'compat-1.5.x';

const profileTsconfigs = new Map([
  ['1.5.0', 'tsconfig.seal1.5.0.json'],
  ['1.5.1', 'tsconfig.seal1.5.1.json'],
  ['1.6.0', 'tsconfig.seal1.6.0.json'],
  [compatibilityTarget, 'tsconfig.compat-1.5.x.json'],
]);

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
  const allowed = new Set(config.sealDice.targets);
  if (allowCompatibility) {
    allowed.add(config.sealDice.compatibilityProfile);
  }
  if (!allowed.has(target)) {
    throw new CliError(`Unknown SealDice target: ${target}`);
  }
  return target;
}

export function tsconfigForTarget(target) {
  const tsconfig = profileTsconfigs.get(target);
  if (tsconfig) return tsconfig;
  throw new CliError(`No TypeScript profile for target: ${target}`);
}
