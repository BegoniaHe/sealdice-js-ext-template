import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

import semver from 'semver';

import { CliError, assert } from '../cli/lib/errors.mjs';
import { sha256, writeAtomic } from '../cli/lib/files.mjs';
import { fromRoot } from '../cli/lib/paths.mjs';

const deflateRawAsync = promisify(deflateRaw);
const manifestFormatVersion = '1.0.0';
const maxZipEntries = 65_535;
const maxZipSize = 0xffff_ffff;
const zipDate = 0x0021; // 1980-01-01, required for byte-for-byte reproducibility.

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data) {
  let value = 0xffff_ffff;
  for (const byte of data)
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffff_ffff) >>> 0;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(', ')}]`;
}

function assertSafeArchivePath(file, label) {
  const normalized = file.replaceAll('\\', '/');
  assert(
    normalized.length > 0 &&
      !normalized.startsWith('/') &&
      !/^[A-Za-z]:/.test(normalized) &&
      !normalized
        .split('/')
        .some((segment) => !segment || segment === '.' || segment === '..'),
    `${label} is not a safe archive-relative path`,
  );
  return normalized;
}

function archiveName(packageID, version) {
  const packageName = packageID.split('/')[1];
  return `${packageName}@${version}.sealpack`;
}

function globPattern(pattern) {
  let expression = '^';
  const specialCharacters = '\\^$+?.()|{}[]';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') expression += '[^/]*';
    else if (character === '?') expression += '[^/]';
    else if (specialCharacters.includes(character))
      expression += `\\${character}`;
    else expression += character;
  }
  return new RegExp(`${expression}$`, 'u');
}

export function artifactPolicyViolations(paths, policy) {
  const patterns = policy.forbiddenPaths.map((pattern) => ({
    expression: globPattern(pattern),
    pattern,
  }));
  const forbiddenExtensions = new Set(policy.forbiddenExtensions);
  const violations = [];
  for (const archivePath of [...paths].sort()) {
    const pathMatch = patterns.find(({ expression }) =>
      expression.test(archivePath),
    );
    if (pathMatch) {
      violations.push({ path: archivePath, rule: `path ${pathMatch.pattern}` });
      continue;
    }
    const extension = path.posix.extname(archivePath).toLowerCase();
    if (forbiddenExtensions.has(extension))
      violations.push({ path: archivePath, rule: `extension ${extension}` });
  }
  return violations;
}

export function assertArtifactPolicy(paths, policy) {
  const violations = artifactPolicyViolations(paths, policy);
  if (violations.length) {
    const detail = violations
      .map(({ path: archivePath, rule }) => `${archivePath} (${rule})`)
      .join(', ');
    throw new CliError(
      `[release:artifact-policy] Sealpack contents violate release.artifactPolicy: ${detail}`,
      3,
    );
  }
}

function renderDependencies(dependencies) {
  return Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([packageID, constraint]) =>
        `${tomlString(packageID)} = ${tomlString(constraint)}`,
    );
}

export function renderSealpackInfo({ config, extension }) {
  const sealpack = config.sealpack;
  const authors = sealpack.authors.length
    ? sealpack.authors
    : [extension.author];
  const permission = sealpack.permissions;
  const lines = [
    `format_version = ${tomlString(manifestFormatVersion)}`,
    '',
    '[package]',
    `id = ${tomlString(sealpack.packageId)}`,
    `name = ${tomlString(extension.name)}`,
    `version = ${tomlString(extension.version)}`,
    `authors = ${tomlArray(authors)}`,
    `license = ${tomlString(extension.license)}`,
    `description = ${tomlString(extension.description)}`,
    `homepage = ${tomlString(extension.homepageUrl)}`,
  ];
  if (sealpack.repository)
    lines.push(`repository = ${tomlString(sealpack.repository)}`);
  if (sealpack.keywords.length)
    lines.push(`keywords = ${tomlArray(sealpack.keywords)}`);

  lines.push(
    '',
    '[package.seal]',
    `min_version = ${tomlString(sealpack.minSealDice)}`,
    '',
    '[dependencies]',
    ...renderDependencies(sealpack.dependencies),
    '',
    '[permissions]',
    `network = ${permission.network}`,
    `network_hosts = ${tomlArray(permission.networkHosts)}`,
    `file_read = ${tomlArray(permission.fileRead)}`,
    `file_write = ${tomlArray(permission.fileWrite)}`,
    `dangerous = ${permission.dangerous}`,
    `http_server = ${permission.httpServer}`,
    `ipc = ${tomlArray(permission.ipc)}`,
    '',
    '[contents]',
    `scripts = ${tomlArray([sealpack.scriptPath])}`,
    'decks = []',
    'reply = []',
    'helpdoc = []',
    'templates = []',
    '',
    '[store]',
    `readme = ${tomlString(sealpack.readme)}`,
    `icon = ${tomlString(sealpack.store.icon)}`,
    `banner = ${tomlString(sealpack.store.banner)}`,
    `screenshots = ${tomlArray(sealpack.store.screenshots)}`,
    `category = ${tomlString(sealpack.store.category)}`,
    '',
    '[config]',
    '',
  );
  return lines.join('\n');
}

function localHeader(entry, checksum) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x0403_4b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(zipDate, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(entry.compressed.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(entry, checksum) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x0201_4b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(zipDate, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(entry.compressed.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(entry.localOffset, 42);
  return header;
}

export async function createZipArchive(entries) {
  assert(entries.length <= maxZipEntries, 'sealpack has too many files');
  const ordered = [...entries].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const names = new Set();
  const resolved = [];
  let offset = 0;
  for (const source of ordered) {
    const archivePath = assertSafeArchivePath(source.path, 'sealpack entry');
    assert(!names.has(archivePath), `Duplicate sealpack entry: ${archivePath}`);
    names.add(archivePath);
    const data = Buffer.isBuffer(source.data)
      ? source.data
      : Buffer.from(source.data);
    assert(
      data.length <= maxZipSize,
      `sealpack entry is too large: ${archivePath}`,
    );
    const compressed = Buffer.from(await deflateRawAsync(data, { level: 9 }));
    const entry = {
      compressed,
      data,
      localOffset: offset,
      name: Buffer.from(archivePath, 'utf8'),
    };
    assert(
      entry.name.length <= 0xffff,
      `ZIP entry name is too long: ${archivePath}`,
    );
    const length = 30 + entry.name.length + entry.compressed.length;
    assert(
      offset + length <= maxZipSize,
      'sealpack ZIP exceeds classic ZIP size limit',
    );
    offset += length;
    resolved.push(entry);
  }

  const localParts = [];
  const centralParts = [];
  for (const entry of resolved) {
    const checksum = crc32(entry.data);
    localParts.push(localHeader(entry, checksum), entry.name, entry.compressed);
    centralParts.push(centralHeader(entry, checksum), entry.name);
  }
  const central = Buffer.concat(centralParts);
  assert(
    offset + central.length <= maxZipSize,
    'sealpack ZIP central directory exceeds classic ZIP size limit',
  );
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(resolved.length, 8);
  end.writeUInt16LE(resolved.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

function projectPath(relative, label) {
  const normalized = assertSafeArchivePath(relative, label);
  const absolute = path.resolve(fromRoot(), normalized);
  const relativeToRoot = path.relative(fromRoot(), absolute);
  assert(
    relativeToRoot &&
      !relativeToRoot.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeToRoot),
    `${label} is outside the project root`,
  );
  return { absolute, normalized };
}

async function collectAssetFiles(relative, files) {
  const { absolute, normalized } = projectPath(relative, 'sealpack asset');
  const stat = await fs.lstat(absolute);
  assert(
    !stat.isSymbolicLink(),
    `sealpack asset must not be a symbolic link: ${relative}`,
  );
  if (stat.isFile()) {
    files.set(normalized, absolute);
    return;
  }
  assert(
    stat.isDirectory(),
    `sealpack asset is neither a file nor directory: ${relative}`,
  );
  const children = await fs.readdir(absolute, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    const childPath = `${normalized}/${child.name}`;
    if (child.isSymbolicLink())
      throw new CliError(
        `sealpack asset must not be a symbolic link: ${childPath}`,
        3,
      );
    if (child.isDirectory()) {
      await collectAssetFiles(childPath, files);
    } else if (child.isFile()) {
      files.set(childPath, path.join(absolute, child.name));
    } else {
      throw new CliError(
        `sealpack asset must be a regular file: ${childPath}`,
        3,
      );
    }
  }
}

async function copyFileIntoStage(stageDirectory, archivePath, source) {
  const target = path.join(stageDirectory, ...archivePath.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

export function assertSealpackTarget(config, extension, target) {
  const { minSealDice, packageId } = config.sealpack;
  assert(
    packageId !== 'template/sealdice-js-ext-template',
    'sealpack.packageId still has the template value; replace it before packaging',
  );
  assert(
    semver.gte(target, minSealDice),
    `sealpack requires SealDice >= ${minSealDice}; received target ${target}`,
  );
  assert(
    extension.version === semver.valid(extension.version),
    'extension version must be canonical semantic version for sealpack packaging',
  );
}

export async function stageSealpack({ bundlePath, config, extension }) {
  const cacheDirectory = fromRoot('.seal', 'cache');
  await fs.mkdir(cacheDirectory, { recursive: true });
  const stageDirectory = await fs.mkdtemp(
    path.join(cacheDirectory, 'sealpack-'),
  );
  try {
    const entries = new Map();
    const bundle = await fs.lstat(bundlePath);
    assert(bundle.isFile(), `sealpack bundle is missing: ${bundlePath}`);
    entries.set(config.sealpack.scriptPath, bundlePath);

    const readme = projectPath(config.sealpack.readme, 'sealpack.readme');
    const readmeStat = await fs.lstat(readme.absolute);
    assert(
      readmeStat.isFile() && !readmeStat.isSymbolicLink(),
      'sealpack.readme must be a regular project file',
    );
    entries.set(readme.normalized, readme.absolute);
    for (const asset of config.sealpack.assets)
      await collectAssetFiles(asset, entries);

    for (const storeAsset of [
      config.sealpack.store.icon,
      config.sealpack.store.banner,
      ...config.sealpack.store.screenshots,
    ]) {
      if (storeAsset && !entries.has(storeAsset))
        throw new CliError(
          `sealpack store asset is not included by sealpack.assets: ${storeAsset}`,
          3,
        );
    }

    assertArtifactPolicy(
      [...entries.keys(), 'info.toml'],
      config.release.artifactPolicy,
    );

    await fs.writeFile(
      path.join(stageDirectory, 'info.toml'),
      renderSealpackInfo({ config, extension }),
      'utf8',
    );
    for (const [archivePath, source] of entries)
      await copyFileIntoStage(stageDirectory, archivePath, source);
    return { directory: stageDirectory };
  } catch (error) {
    await fs.rm(stageDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function filesInStage(stageDirectory, current = '') {
  const directory = path.join(
    stageDirectory,
    ...current.split('/').filter(Boolean),
  );
  const children = await fs.readdir(directory, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const child of children) {
    const relative = current ? `${current}/${child.name}` : child.name;
    if (child.isDirectory())
      files.push(...(await filesInStage(stageDirectory, relative)));
    else if (child.isFile())
      files.push({
        path: relative,
        data: await fs.readFile(path.join(directory, child.name)),
      });
    else
      throw new CliError(
        `sealpack stage contains a non-regular file: ${relative}`,
        3,
      );
  }
  return files;
}

export async function archiveSealpack({
  config,
  extension,
  releaseDirectory,
  stage,
}) {
  try {
    const archive = await createZipArchive(await filesInStage(stage.directory));
    const artifact = archiveName(config.sealpack.packageId, extension.version);
    await writeAtomic(path.join(releaseDirectory, artifact), archive);
    return {
      artifact,
      format: 'sealpack',
      sha256: sha256(archive),
      size: archive.length,
    };
  } finally {
    await fs.rm(stage.directory, { force: true, recursive: true });
  }
}
