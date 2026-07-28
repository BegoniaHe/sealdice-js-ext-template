import { spawn } from 'node:child_process';

import { CliError } from './errors.mjs';

export function run(command, argumentsList, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

export async function runChecked(command, argumentsList, options = {}) {
  let result;
  try {
    result = await run(command, argumentsList, options);
  } catch (error) {
    throw new CliError(`Could not start ${command}: ${error.message}`, 5);
  }
  if (result.code !== 0) {
    const detail = options.capture ? `\n${result.stderr}` : '';
    throw new CliError(`${command} exited with ${result.code}.${detail}`, 5);
  }
  return result;
}
