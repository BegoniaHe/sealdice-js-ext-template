import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliError } from './errors.mjs';

export function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliError(`Invalid JSON in ${file}: ${error.message}`);
    }
    throw error;
  }
}

export async function writeAtomic(file, content) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporary, content, 'utf8');
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function writeJsonAtomic(file, value) {
  await writeAtomic(file, stableJson(value));
}

export async function fileContentsEqual(file, content) {
  try {
    return (await fs.readFile(file, 'utf8')) === content;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function resolveExistingOrTarget(file) {
  const absolute = path.resolve(file);
  try {
    return await fs.realpath(absolute);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return absolute;
    }
    throw error;
  }
}

export async function removeKnownDirectory(root, directory) {
  const allowedDirectories = new Set(['dev', 'dist', 'release', '.seal/cache']);
  if (!allowedDirectories.has(directory)) {
    throw new CliError(
      `Refusing to remove a non-generated directory: ${directory}`,
    );
  }
  const rootReal = await fs.realpath(root);
  const candidate = path.resolve(root, directory);
  const expected = path.join(rootReal, directory);
  const home = path.resolve(os.homedir());
  if (
    candidate !== expected ||
    candidate === rootReal ||
    candidate === path.parse(candidate).root ||
    candidate === home
  ) {
    throw new CliError(`Refusing to remove unsafe path: ${candidate}`);
  }
  let details;
  try {
    details = await fs.lstat(candidate);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
  const parentReal = await fs.realpath(path.dirname(candidate));
  if (
    !parentReal.startsWith(`${rootReal}${path.sep}`) &&
    parentReal !== rootReal
  ) {
    throw new CliError(`Refusing symlink escape while removing: ${candidate}`);
  }
  if (details.isSymbolicLink()) {
    throw new CliError(`Refusing to remove symbolic link: ${candidate}`);
  }
  await fs.rm(candidate, { recursive: true, force: true });
}
