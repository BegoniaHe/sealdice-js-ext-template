import { CliError } from './errors.mjs';
import { run, runChecked } from './process.mjs';

export async function installDependencies(
  packageManager,
  updateLock,
  offline = false,
) {
  const offlineArgument = offline ? ['--offline'] : [];
  if (packageManager === 'npm') {
    return runChecked(
      'npm',
      updateLock ? ['install', ...offlineArgument] : ['ci', ...offlineArgument],
    );
  }
  return runChecked(
    'pnpm',
    updateLock
      ? ['install', ...offlineArgument]
      : ['install', '--frozen-lockfile', ...offlineArgument],
  );
}

export async function dependencyCommand(
  packageManager,
  action,
  packages,
  development,
) {
  if (!packages.length && action !== 'update' && action !== 'status') {
    throw new CliError(`deps ${action} requires at least one package`);
  }
  if (action === 'status') {
    const result = await run(packageManager, ['outdated']);
    if (result.code > 1) {
      throw new CliError(
        `${packageManager} outdated exited with ${result.code}`,
        5,
      );
    }
    return;
  }
  if (action === 'update') {
    return runChecked(packageManager, ['update']);
  }
  if (action === 'add') {
    const args = packageManager === 'npm' ? ['install'] : ['add'];
    if (development) args.push('--save-dev');
    args.push(...packages);
    return runChecked(packageManager, args);
  }
  if (action === 'remove') {
    return runChecked(packageManager, [
      packageManager === 'npm' ? 'uninstall' : 'remove',
      ...packages,
    ]);
  }
  throw new CliError(`Unknown dependency command: ${action}`);
}
