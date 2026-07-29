import fs from 'node:fs/promises';
import path from 'node:path';

const testFileNames = ['.test.mjs', '.test.ts'];

export function isTestFile(file) {
  return testFileNames.some((suffix) => file.endsWith(suffix));
}

export async function findTestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return entry.isFile() && isTestFile(entry.name) ? [entryPath] : [];
    }),
  );
  return nested.flat().sort();
}
