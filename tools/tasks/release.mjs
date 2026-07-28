import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256, writeAtomic, writeJsonAtomic } from '../cli/lib/files.mjs';

export async function releaseJavaScriptArtifact({
  bundlePath,
  extension,
  releaseDirectory,
}) {
  const artifact = `${extension.id}-${extension.version}.js`;
  const output = path.join(releaseDirectory, artifact);
  const content = await fs.readFile(bundlePath);
  await writeAtomic(output, content);
  return {
    artifact,
    format: 'js',
    sha256: sha256(content),
    size: content.length,
  };
}

export async function writeArtifactChecksums({ artifacts, releaseDirectory }) {
  for (const artifact of artifacts)
    await writeAtomic(
      path.join(releaseDirectory, `${artifact.artifact}.sha256`),
      `${artifact.sha256}  ${artifact.artifact}\n`,
    );
}

export async function writeReleaseManifest({
  artifacts,
  extension,
  profileHash,
  releaseDirectory,
  target,
}) {
  const primary = artifacts[0];
  const manifest = {
    artifact: primary.artifact,
    artifacts,
    author: extension.author,
    id: extension.id,
    license: extension.license,
    name: extension.name,
    profile: target,
    profileHash,
    sha256: primary.sha256,
    version: extension.version,
  };
  await writeJsonAtomic(path.join(releaseDirectory, 'manifest.json'), manifest);
  return manifest;
}
