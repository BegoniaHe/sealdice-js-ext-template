import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliError, assert } from '../cli/lib/errors.mjs';
import { readJson, stableJson, writeAtomic } from '../cli/lib/files.mjs';
import { rootDirectory } from '../cli/lib/paths.mjs';
import { profileForTarget } from '../cli/lib/target.mjs';

const rootFiles = [
  'LICENSE',
  'eslint.config.mjs',
  'mise.toml',
  'sealw',
  'tsconfig.base.json',
  'tsconfig.json',
];

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(relative, destination) {
  const source = path.join(rootDirectory, ...relative.split('/'));
  const stat = await fs.lstat(source);
  assert(
    stat.isFile() && !stat.isSymbolicLink(),
    `Template file is not a regular file: ${relative}`,
    3,
  );
  const output = path.join(destination, ...relative.split('/'));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.copyFile(source, output);
  await fs.chmod(output, stat.mode);
}

async function copyDirectory(relative, destination) {
  const source = path.join(rootDirectory, ...relative.split('/'));
  const stat = await fs.lstat(source);
  assert(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `Template directory is not a regular directory: ${relative}`,
    3,
  );
  const output = path.join(destination, ...relative.split('/'));
  await fs.mkdir(output, { recursive: true });
  const children = await fs.readdir(source, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    const childRelative = `${relative}/${child.name}`;
    if (child.isDirectory()) await copyDirectory(childRelative, destination);
    else if (child.isFile()) await copyFile(childRelative, destination);
    else
      throw new CliError(
        `Template contains an unsupported scaffold entry: ${childRelative}`,
        3,
      );
  }
}

async function copyTopLevelTests(destination) {
  const directory = path.join(rootDirectory, 'tests');
  const children = await fs.readdir(directory, { withFileTypes: true });
  for (const child of children)
    if (child.isFile() && child.name !== 'init.test.mjs')
      await copyFile(`tests/${child.name}`, destination);
  await copyDirectory('tests/support', destination);
}

function singleTargetScripts(scripts, target) {
  return {
    ...scripts,
    build: `./sealw build --target ${target}`,
    check: `./sealw check --target ${target}`,
    dev: `./sealw watch --target ${target}`,
    test: `./sealw test --target ${target}`,
    typecheck: `./sealw typecheck --target ${target}`,
  };
}

export function singleTargetConfig(config, target) {
  const profile = profileForTarget(config, target);
  if (profile.kind !== 'exact')
    throw new CliError(
      `Single-target initialization requires an exact SealDice target, received: ${target}`,
      3,
    );
  return {
    ...config,
    sealDice: {
      defaultTarget: target,
      profiles: [profile],
    },
  };
}

export function renderSingleTargetReadme(target) {
  return `# SealDice JavaScript Extension

这是使用 \`single-target\` 预设生成的 SealDice TypeScript 扩展，唯一支持的宿主版本是
\`${target}\`。修改 \`extension.json\` 与 \`src/\` 后即可开始开发。

## Commands

\`./sealw\` 的日常命令已经固定为此 target：

\`\`\`text
./sealw watch --target ${target}      Rebuild dev/sealdice-js-ext.js
./sealw test --target ${target}       Run Node, mock-host and bundle tests
./sealw check --target ${target}      Run the complete local verification pipeline
./sealw package --target ${target}    Verify, load in the real goja runtime, and package
\`\`\`

\`package\` 的真实 runtime 验证需要对应 SealDice core checkout；使用
\`--core /path/to/sealdice-core\` 或 \`SEAL_CORE_DIR\` 指定。配置、会话测试 helper 与制品规则的
说明保留在源码注释和 \`seal.config.json\` 中。
`;
}

async function createOutputDirectory(directory) {
  const output = path.resolve(directory);
  const template = await fs.realpath(rootDirectory);
  const home = path.resolve(os.homedir());
  assert(
    output !== template &&
      output !== home &&
      output !== path.parse(output).root,
    `Refusing unsafe initialization directory: ${output}`,
    3,
  );
  assert(
    !(await exists(output)),
    `Initialization directory already exists: ${output}`,
    3,
  );
  const parent = path.dirname(output);
  try {
    const stat = await fs.lstat(parent);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      `Initialization parent must be a regular directory: ${parent}`,
      3,
    );
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Initialization parent does not exist: ${parent}`, 3);
  }
  await fs.mkdir(output);
  return output;
}

async function writeSingleTargetMetadata(destination, config, target) {
  const packageMetadata = await readJson(
    path.join(rootDirectory, 'package.json'),
  );
  const generatedPackage = {
    ...packageMetadata,
    scripts: singleTargetScripts(packageMetadata.scripts, target),
  };
  await writeAtomic(
    path.join(destination, 'package.json'),
    stableJson(generatedPackage),
  );
  await writeAtomic(
    path.join(destination, 'seal.config.json'),
    stableJson(singleTargetConfig(config, target)),
  );
  await writeAtomic(
    path.join(destination, 'README.md'),
    renderSingleTargetReadme(target),
  );
}

export async function createSingleTargetProject({ config, directory, target }) {
  const selected = singleTargetConfig(config, target);
  const destination = await createOutputDirectory(directory);
  try {
    for (const file of rootFiles) await copyFile(file, destination);
    await copyFile('extension.json', destination);
    await copyFile('package-lock.json', destination);
    await copyFile('types/seal.d.ts', destination);
    await copyFile(`api/overrides/${target}.json`, destination);
    await copyFile(`api/profiles/${target}.json`, destination);
    await copyFile(`api/reports/${target}.api.md`, destination);
    await copyFile(`types/profiles/${target}/seal.d.ts`, destination);
    await copyDirectory('api/schema', destination);
    await copyDirectory('src', destination);
    await copyDirectory('tools', destination);
    await copyTopLevelTests(destination);
    if (await exists(path.join(rootDirectory, 'tests', 'profiles', target)))
      await copyDirectory(`tests/profiles/${target}`, destination);
    await writeSingleTargetMetadata(destination, selected, target);
  } catch (error) {
    await fs.rm(destination, { force: true, recursive: true });
    throw error;
  }
  return destination;
}
