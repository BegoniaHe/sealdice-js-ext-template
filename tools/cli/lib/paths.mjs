import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDirectory = path.dirname(fileURLToPath(import.meta.url));

export const rootDirectory = path.resolve(thisDirectory, '../../..');
export const configPath = path.join(rootDirectory, 'seal.config.json');
export const packagePath = path.join(rootDirectory, 'package.json');
export const profileDirectory = path.join(rootDirectory, 'api', 'profiles');
export const reportDirectory = path.join(rootDirectory, 'api', 'reports');
export const typeProfileDirectory = path.join(
  rootDirectory,
  'types',
  'profiles',
);

export function fromRoot(...parts) {
  return path.join(rootDirectory, ...parts);
}
