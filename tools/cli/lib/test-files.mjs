import fs from 'node:fs/promises';
import path from 'node:path';

export async function findTestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.test.mjs')
        ? [entryPath]
        : [];
    }),
  );
  return nested.flat().sort();
}
