import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { build, context } from 'esbuild';

import {
  loadExtensionMetadata,
  renderUserscriptHeader,
} from '../cli/lib/metadata.mjs';
import { rootDirectory } from '../cli/lib/paths.mjs';
import { tsconfigForTarget } from '../cli/lib/target.mjs';
import { assertRuntimePolicy } from './runtime-policy.mjs';

export function outputPath(config, mode) {
  return path.join(
    rootDirectory,
    mode === 'production' ? 'dist' : 'dev',
    config.build.bundleFileName,
  );
}

async function buildOptions({ config, mode, target, outfile }) {
  const header = renderUserscriptHeader(await loadExtensionMetadata());
  const isProduction = mode === 'production';
  return {
    banner: { js: header },
    bundle: true,
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    entryPoints: [path.join(rootDirectory, config.build.entry)],
    format: 'iife',
    logLevel: 'error',
    minify: isProduction,
    outfile,
    platform: 'browser',
    sourcemap: isProduction ? false : 'external',
    target: config.build.ecmaTarget,
    treeShaking: true,
    tsconfig: await tsconfigForTarget(config, target),
  };
}

export async function buildBundle({ config, mode = 'production', target }) {
  const destination = outputPath(config, mode);
  const directory = path.dirname(destination);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}.tmp.js`,
  );
  const temporaryMap = `${temporary}.map`;
  try {
    await build(
      await buildOptions({ config, mode, target, outfile: temporary }),
    );
    await assertRuntimePolicy(temporary, config);
    if (mode !== 'production') {
      const source = await fs.readFile(temporary, 'utf8');
      const finalMap = `${destination}.map`;
      const rewritten = source.replace(
        /\/\/# sourceMappingURL=[^\r\n]+/,
        `//# sourceMappingURL=${path.basename(finalMap)}`,
      );
      await fs.writeFile(temporary, rewritten, 'utf8');
      await fs.rename(temporaryMap, finalMap);
    }
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
    await fs.rm(temporaryMap, { force: true });
  }
  return destination;
}

export async function watchBundle({ config, target }) {
  const outfile = outputPath(config, 'development');
  await fs.mkdir(path.dirname(outfile), { recursive: true });
  const buildContext = await context(
    await buildOptions({ config, mode: 'development', target, outfile }),
  );
  await buildContext.watch();
  process.stdout.write(`Watching ${path.relative(rootDirectory, outfile)}\n`);
  const stop = async () => {
    await buildContext.dispose();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await new Promise(() => {});
}
