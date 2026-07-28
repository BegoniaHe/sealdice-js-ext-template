import { CliError } from '../cli/lib/errors.mjs';

function taskFor(tasks, name) {
  const task = tasks[name];
  if (!task) throw new CliError(`Unknown build task: ${name}`, 3);
  if (typeof task.run !== 'function')
    throw new CliError(`Build task ${name} has no run function`, 3);
  return task;
}

// Executes the dependency closure once and returns each task's result by name.
export async function runTaskGraph(tasks, requested) {
  const completed = new Map();
  const visiting = new Set();

  async function run(name) {
    if (completed.has(name)) return completed.get(name);
    if (visiting.has(name))
      throw new CliError(`Build task dependency cycle at ${name}`, 3);

    const task = taskFor(tasks, name);
    visiting.add(name);
    try {
      for (const dependency of task.dependencies ?? []) await run(dependency);
      const result = await task.run({ results: completed });
      completed.set(name, result);
      return result;
    } finally {
      visiting.delete(name);
    }
  }

  for (const name of requested) await run(name);
  return completed;
}
