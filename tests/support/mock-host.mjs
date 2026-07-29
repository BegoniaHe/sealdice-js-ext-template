import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FakeClock } from './fake-clock.mjs';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

async function readProfile(target) {
  const file = path.join(rootDirectory, 'api', 'profiles', `${target}.json`);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function latestConfig(config, extension, key) {
  for (let index = config.length - 1; index >= 0; index -= 1) {
    const item = config[index];
    if (item.extension === extension && item.key === key) return item;
  }
  return null;
}

export async function createMockHost(target, { now = 0 } = {}) {
  const profile = await readProfile(target);
  const entries = new Map(profile.entries.map((entry) => [entry.path, entry]));
  const extensions = new Map();
  const replies = [];
  const messages = [];
  const variables = new Map();
  const config = [];
  const tasks = [];
  const gameSystems = [];
  const events = [];
  const clock = new FakeClock(now);
  const event = (kind, details = {}) => events.push({ ...details, kind });

  const makeExtension = (name, author, version) => {
    const storage = new Map();
    return {
      aliases: [],
      author,
      autoActive: true,
      cmdMap: {},
      name,
      storageClose() {},
      storageGet: (key) => storage.get(key) ?? '',
      storageInit() {},
      storageSet: (key, value) => storage.set(key, value),
      version,
    };
  };
  const profileFunction = (memberPath, implementation) => {
    const entry = entries.get(memberPath);
    if (!entry || entry.kind !== 'function') return undefined;
    Object.defineProperty(implementation, 'length', {
      configurable: true,
      value: entry.arity ?? 0,
    });
    return implementation;
  };
  const objectFromProfile = (memberPath, members) =>
    entries.has(memberPath) ? members : undefined;
  const createConfigItem = (
    extension,
    key,
    defaultValue,
    description = '',
    type = '',
    option = [],
    group = '',
  ) => ({
    defaultValue,
    deprecated: false,
    description,
    extension,
    group,
    key,
    option,
    type,
    value: defaultValue,
  });
  const recordConfig = (item) => {
    const index = config.findIndex(
      (current) =>
        current.extension === item.extension && current.key === item.key,
    );
    if (index !== -1) config.splice(index, 1);
    config.push(item);
    event('config-register', { key: item.key, type: item.type });
  };
  const createConfigRegistrar = (type, memberPath, groupArity) =>
    profileFunction(memberPath, (extension, key, defaultValue, ...rest) => {
      const supportsGroup = entries.get(memberPath).arity === groupArity;
      const group = supportsGroup ? (rest.at(-1) ?? '') : '';
      const values = supportsGroup ? rest.slice(0, -1) : rest;
      const option = type === 'option' ? (values[0] ?? []) : [];
      const description =
        type === 'option' ? (values[1] ?? '') : (values[0] ?? '');
      const item = createConfigItem(
        extension,
        key,
        defaultValue,
        description,
        type,
        option,
        group,
      );
      item.rest = values;
      recordConfig(item);
    });
  const reply = (channel) => (ctx, msg, text) => {
    replies.push(text);
    messages.push({ channel, ctx, msg, text });
    event('message-reply', { channel, text });
  };
  const ext = objectFromProfile('seal.ext', {});
  if (ext) {
    ext.find = profileFunction('seal.ext.find', (name) => {
      event('extension-find', { name });
      return extensions.get(name) ?? null;
    });
    ext.getConfig = profileFunction('seal.ext.getConfig', (extension, key) =>
      latestConfig(config, extension, key),
    );
    ext.getBoolConfig = profileFunction(
      'seal.ext.getBoolConfig',
      (extension, key) => Boolean(latestConfig(config, extension, key)?.value),
    );
    ext.getFloatConfig = profileFunction(
      'seal.ext.getFloatConfig',
      (extension, key) =>
        Number(latestConfig(config, extension, key)?.value ?? 0),
    );
    ext.getIntConfig = profileFunction(
      'seal.ext.getIntConfig',
      (extension, key) =>
        Number(latestConfig(config, extension, key)?.value ?? 0),
    );
    ext.getOptionConfig = profileFunction(
      'seal.ext.getOptionConfig',
      (extension, key) =>
        String(latestConfig(config, extension, key)?.value ?? ''),
    );
    ext.getStringConfig = profileFunction(
      'seal.ext.getStringConfig',
      (extension, key) =>
        String(latestConfig(config, extension, key)?.value ?? ''),
    );
    ext.getTemplateConfig = profileFunction(
      'seal.ext.getTemplateConfig',
      (extension, key) => {
        const value = latestConfig(config, extension, key)?.value;
        return Array.isArray(value) ? value : [];
      },
    );
    ext.new = profileFunction('seal.ext.new', (name, author, version) => {
      event('extension-new', { name });
      return makeExtension(name, author, version);
    });
    ext.newCmdExecuteResult = profileFunction(
      'seal.ext.newCmdExecuteResult',
      (solved) => ({ showHelp: false, solved }),
    );
    ext.newCmdItemInfo = profileFunction('seal.ext.newCmdItemInfo', () => ({}));
    ext.newConfigItem = profileFunction(
      'seal.ext.newConfigItem',
      (extension, key, defaultValue, description) =>
        createConfigItem(extension, key, defaultValue, description),
    );
    ext.register = profileFunction('seal.ext.register', (extension) => {
      event('extension-register', { name: extension.name });
      extensions.set(extension.name, extension);
    });
    ext.registerBoolConfig = createConfigRegistrar(
      'bool',
      'seal.ext.registerBoolConfig',
      5,
    );
    ext.registerConfig = profileFunction(
      'seal.ext.registerConfig',
      (_extension, ...items) => items.forEach(recordConfig),
    );
    ext.registerFloatConfig = createConfigRegistrar(
      'float',
      'seal.ext.registerFloatConfig',
      5,
    );
    ext.registerIntConfig = createConfigRegistrar(
      'int',
      'seal.ext.registerIntConfig',
      5,
    );
    ext.registerOptionConfig = createConfigRegistrar(
      'option',
      'seal.ext.registerOptionConfig',
      6,
    );
    ext.registerStringConfig = createConfigRegistrar(
      'string',
      'seal.ext.registerStringConfig',
      5,
    );
    ext.registerTask = profileFunction(
      'seal.ext.registerTask',
      (_extension, taskType, value, callback, ...rest) => {
        const task = {
          active: true,
          off: () => (task.active = false),
          on: () => (task.active = true),
        };
        const supportsGroup = entries.get('seal.ext.registerTask').arity === 7;
        const [key = '', description = '', group = ''] = rest;
        tasks.push({
          callback,
          description,
          group: supportsGroup ? group : '',
          key,
          task,
          taskType,
          value,
        });
        event('task-register', { key, taskType, value });
        return task;
      },
    );
    ext.registerTemplateConfig = createConfigRegistrar(
      'template',
      'seal.ext.registerTemplateConfig',
      5,
    );
    ext.unregisterConfig = profileFunction(
      'seal.ext.unregisterConfig',
      (extension, ...keys) => {
        for (let index = config.length - 1; index >= 0; index -= 1) {
          const item = config[index];
          if (item.extension === extension && keys.includes(item.key))
            config.splice(index, 1);
        }
      },
    );
  }
  const seal = {
    applyPlayerGroupCardByTemplate: profileFunction(
      'seal.applyPlayerGroupCardByTemplate',
      (_ctx, template) => template,
    ),
    ban: objectFromProfile('seal.ban', {
      addBan: profileFunction('seal.ban.addBan', () => {}),
      addTrust: profileFunction('seal.ban.addTrust', () => {}),
      getList: profileFunction('seal.ban.getList', () => []),
      getUser: profileFunction('seal.ban.getUser', () => null),
      remove: profileFunction('seal.ban.remove', () => {}),
    }),
    base64ToImage: profileFunction('seal.base64ToImage', (base64) => base64),
    coc: objectFromProfile('seal.coc', {
      newRule: profileFunction('seal.coc.newRule', () => ({})),
      newRuleCheckResult: profileFunction(
        'seal.coc.newRuleCheckResult',
        () => ({}),
      ),
      registerRule: profileFunction('seal.coc.registerRule', () => true),
    }),
    createTempCtx: profileFunction('seal.createTempCtx', () => ({})),
    deck: objectFromProfile('seal.deck', {
      draw: profileFunction('seal.deck.draw', () => ({
        err: '',
        exists: false,
        result: '',
      })),
      reload: profileFunction('seal.deck.reload', () => {}),
    }),
    ext,
    format: profileFunction('seal.format', (_ctx, text) => text),
    formatTmpl: profileFunction('seal.formatTmpl', (_ctx, text) => text),
    gameSystem: objectFromProfile('seal.gameSystem', {
      newTemplate: profileFunction('seal.gameSystem.newTemplate', (data) => {
        gameSystems.push({ data, format: 'json' });
      }),
      newTemplateByYaml: profileFunction(
        'seal.gameSystem.newTemplateByYaml',
        (data) => {
          gameSystems.push({ data, format: 'yaml' });
        },
      ),
    }),
    getCtxProxyAtPos: profileFunction('seal.getCtxProxyAtPos', (ctx) => ctx),
    getCtxProxyFirst: profileFunction('seal.getCtxProxyFirst', (ctx) => ctx),
    getEndPoints: profileFunction('seal.getEndPoints', () => []),
    getVersion: profileFunction('seal.getVersion', () => ({
      version: profile.sealDiceVersion,
      versionCode: 0,
      versionDetail: {
        buildMetaData: '',
        major: 0,
        minor: 0,
        patch: 0,
        prerelease: '',
      },
      versionSimple: profile.sealDiceVersion,
    })),
    memberBan: profileFunction('seal.memberBan', () => {}),
    memberKick: profileFunction('seal.memberKick', () => {}),
    newMessage: profileFunction('seal.newMessage', () => ({})),
    replyGroup: profileFunction('seal.replyGroup', reply('group')),
    replyPerson: profileFunction('seal.replyPerson', reply('person')),
    replyToSender: profileFunction('seal.replyToSender', reply('sender')),
    setPlayerGroupCard: profileFunction(
      'seal.setPlayerGroupCard',
      (_ctx, template) => template,
    ),
    vars: objectFromProfile('seal.vars', {
      computedGet: profileFunction('seal.vars.computedGet', (_ctx, key) => [
        variables.get(key) ?? '',
        variables.has(key),
      ]),
      computedSet: profileFunction(
        'seal.vars.computedSet',
        (_ctx, key, value) => variables.set(key, value),
      ),
      intGet: profileFunction('seal.vars.intGet', (_ctx, key) => [
        Number(variables.get(key) ?? 0),
        variables.has(key),
      ]),
      intSet: profileFunction('seal.vars.intSet', (_ctx, key, value) =>
        variables.set(key, value),
      ),
      strGet: profileFunction('seal.vars.strGet', (_ctx, key) => [
        String(variables.get(key) ?? ''),
        variables.has(key),
      ]),
      strSet: profileFunction('seal.vars.strSet', (_ctx, key, value) =>
        variables.set(key, value),
      ),
    }),
  };
  return {
    assertNoActiveTasks() {
      const active = tasks.filter(({ task }) => task.active);
      if (active.length) {
        const keys = active.map(({ key }) => key || '(anonymous)').join(', ');
        throw new Error(`Mock host still has active tasks: ${keys}`);
      }
    },
    clock,
    config,
    events,
    extensions,
    gameSystems,
    globals: {
      clearInterval: (identifier) => clock.clearInterval(identifier),
      clearTimeout: (identifier) => clock.clearTimeout(identifier),
      setInterval: (...argumentsList) => clock.setInterval(...argumentsList),
      setTimeout: (...argumentsList) => clock.setTimeout(...argumentsList),
    },
    lastEvent() {
      return events.at(-1) ?? null;
    },
    messages,
    profile,
    replies,
    runTask(key, context = {}) {
      const task = tasks.find(
        (candidate) => candidate.key === key && candidate.task.active,
      );
      if (!task) throw new Error(`No active mock task registered as ${key}`);
      event('task-run', { key });
      return task.callback({ key, now: clock.now, ...context });
    },
    seal,
    setConfig(extension, key, value) {
      const item = latestConfig(config, extension, key);
      if (!item) throw new Error(`No mock config registered as ${key}`);
      item.value = value;
      event('config-set', { key });
    },
    tasks,
    variables,
  };
}
