export class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function assert(condition, message, exitCode = 2) {
  if (!condition) {
    throw new CliError(message, exitCode);
  }
}
