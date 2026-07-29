type ConfigKind = 'bool' | 'float' | 'int' | 'option' | 'string' | 'template';

type ConfigValue = boolean | number | string | string[];

interface ConfigDefinitionBase<
  Kind extends ConfigKind,
  Value extends ConfigValue,
> {
  default: Value;
  description: string;
  group?: string;
  kind: Kind;
}

export type BooleanConfigDefinition = ConfigDefinitionBase<'bool', boolean>;

interface NumberConfigDefinition<
  Kind extends 'float' | 'int',
> extends ConfigDefinitionBase<Kind, number> {
  max?: number;
  min?: number;
}

export interface OptionConfigDefinition extends ConfigDefinitionBase<
  'option',
  string
> {
  options: readonly string[];
}

export type StringConfigDefinition = ConfigDefinitionBase<'string', string>;

export type TemplateConfigDefinition = ConfigDefinitionBase<
  'template',
  string[]
>;

export type ConfigDefinition =
  | BooleanConfigDefinition
  | NumberConfigDefinition<'float'>
  | NumberConfigDefinition<'int'>
  | OptionConfigDefinition
  | StringConfigDefinition
  | TemplateConfigDefinition;

export type PluginConfigDefinitions = Record<string, ConfigDefinition>;

type ConfigValueFor<Definition extends ConfigDefinition> =
  Definition extends ConfigDefinitionBase<ConfigKind, infer Value>
    ? Value
    : never;

export type PluginConfigValues<Definitions extends PluginConfigDefinitions> = {
  [Key in keyof Definitions]: ConfigValueFor<Definitions[Key]>;
};

export interface ConfigIssue {
  key: string;
  message: string;
  value: ConfigValue;
}

export interface ConfigReadResult<Definitions extends PluginConfigDefinitions> {
  issues: ConfigIssue[];
  values: PluginConfigValues<Definitions>;
}

export interface PluginConfig<Definitions extends PluginConfigDefinitions> {
  definitions: Definitions;
  markdown(): string;
  read(extension: seal.ExtInfo): ConfigReadResult<Definitions>;
  register(extension: seal.ExtInfo): void;
  validate(values: PluginConfigValues<Definitions>): ConfigIssue[];
}

interface CommonOptions {
  description: string;
  group?: string;
}

export function boolean(
  options: CommonOptions & { default: boolean },
): BooleanConfigDefinition {
  return { ...options, kind: 'bool' };
}

export function float(
  options: CommonOptions & { default: number; max?: number; min?: number },
): NumberConfigDefinition<'float'> {
  return numberDefinition('float', options);
}

export function integer(
  options: CommonOptions & { default: number; max?: number; min?: number },
): NumberConfigDefinition<'int'> {
  return numberDefinition('int', options);
}

function numberDefinition<Kind extends 'float' | 'int'>(
  kind: Kind,
  options: CommonOptions & { default: number; max?: number; min?: number },
): NumberConfigDefinition<Kind> {
  if (!Number.isFinite(options.default))
    throw new Error(`${kind} config default must be finite`);
  if (kind === 'int' && !Number.isInteger(options.default))
    throw new Error('int config default must be an integer');
  if (
    options.min !== undefined &&
    options.max !== undefined &&
    options.min > options.max
  )
    throw new Error(`${kind} config min must not exceed max`);
  return { ...options, kind };
}

export function option(
  options: CommonOptions & {
    default: string;
    options: readonly string[];
  },
): OptionConfigDefinition {
  if (!options.options.includes(options.default))
    throw new Error('option config default must be one of its options');
  return { ...options, kind: 'option' };
}

export function string(
  options: CommonOptions & { default: string },
): StringConfigDefinition {
  return { ...options, kind: 'string' };
}

export function template(
  options: CommonOptions & { default: readonly string[] },
): TemplateConfigDefinition {
  return { ...options, default: [...options.default], kind: 'template' };
}

type ConfigRegistrar = (
  extension: seal.ExtInfo,
  key: string,
  defaultValue: never,
  ...details: unknown[]
) => void;

type ConfigGetter = (extension: seal.ExtInfo, key: string) => ConfigValue;

function registrarFor(definition: ConfigDefinition): ConfigRegistrar {
  switch (definition.kind) {
    case 'bool':
      return seal.ext.registerBoolConfig.bind(seal.ext) as ConfigRegistrar;
    case 'float':
      return seal.ext.registerFloatConfig.bind(seal.ext) as ConfigRegistrar;
    case 'int':
      return seal.ext.registerIntConfig.bind(seal.ext) as ConfigRegistrar;
    case 'option':
      return seal.ext.registerOptionConfig.bind(seal.ext) as ConfigRegistrar;
    case 'string':
      return seal.ext.registerStringConfig.bind(seal.ext) as ConfigRegistrar;
    case 'template':
      return seal.ext.registerTemplateConfig.bind(seal.ext) as ConfigRegistrar;
  }
}

function getterFor(definition: ConfigDefinition): ConfigGetter {
  switch (definition.kind) {
    case 'bool':
      return seal.ext.getBoolConfig.bind(seal.ext);
    case 'float':
      return seal.ext.getFloatConfig.bind(seal.ext);
    case 'int':
      return seal.ext.getIntConfig.bind(seal.ext);
    case 'option':
      return seal.ext.getOptionConfig.bind(seal.ext);
    case 'string':
      return seal.ext.getStringConfig.bind(seal.ext);
    case 'template':
      return seal.ext.getTemplateConfig.bind(seal.ext);
  }
}

function registerDefinition(
  extension: seal.ExtInfo,
  key: string,
  definition: ConfigDefinition,
): void {
  const registrar = registrarFor(definition);
  const details =
    definition.kind === 'option'
      ? [definition.options, definition.description]
      : [definition.description];
  if (definition.group !== undefined && registrar.length >= details.length + 4)
    registrar(
      extension,
      key,
      definition.default as never,
      ...details,
      definition.group,
    );
  else registrar(extension, key, definition.default as never, ...details);
}

function validationIssue(
  key: string,
  definition: ConfigDefinition,
  value: ConfigValue,
): ConfigIssue | null {
  if (definition.kind === 'template') {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
      return null;
    return { key, message: 'must be a string array', value };
  }
  if (definition.kind === 'bool') {
    return typeof value === 'boolean'
      ? null
      : { key, message: 'must be a boolean', value };
  }
  if (definition.kind === 'string') {
    return typeof value === 'string'
      ? null
      : { key, message: 'must be a string', value };
  }
  if (definition.kind === 'option') {
    if (typeof value !== 'string')
      return { key, message: 'must be a string', value };
    return definition.options.includes(value)
      ? null
      : {
          key,
          message: `must be one of: ${definition.options.join(', ')}`,
          value,
        };
  }
  if (typeof value !== 'number' || !Number.isFinite(value))
    return { key, message: 'must be a finite number', value };
  if (definition.kind === 'int' && !Number.isInteger(value))
    return { key, message: 'must be an integer', value };
  if (definition.min !== undefined && value < definition.min)
    return {
      key,
      message: `must be at least ${String(definition.min)}`,
      value,
    };
  if (definition.max !== undefined && value > definition.max)
    return { key, message: `must be at most ${String(definition.max)}`, value };
  return null;
}

function markdownCell(value: string): string {
  return value.split('|').join('\\|').split('\n').join('<br>');
}

function definitionConstraints(definition: ConfigDefinition): string {
  if (definition.kind === 'option') return definition.options.join(', ');
  if (definition.kind === 'float' || definition.kind === 'int') {
    const values = [];
    if (definition.min !== undefined)
      values.push(`min ${String(definition.min)}`);
    if (definition.max !== undefined)
      values.push(`max ${String(definition.max)}`);
    return values.join(', ');
  }
  return '';
}

export function definePluginConfig<Definitions extends PluginConfigDefinitions>(
  definitions: Definitions,
): PluginConfig<Definitions> {
  const entries = Object.entries(definitions) as [
    keyof Definitions & string,
    Definitions[keyof Definitions],
  ][];

  return {
    definitions,
    markdown(): string {
      const rows = entries.map(([key, definition]) => {
        const defaultValue = Array.isArray(definition.default)
          ? definition.default.join(', ')
          : String(definition.default);
        return `| ${markdownCell(key)} | ${definition.kind} | ${markdownCell(defaultValue)} | ${markdownCell(definitionConstraints(definition))} | ${markdownCell(definition.group ?? '')} | ${markdownCell(definition.description)} |`;
      });
      return [
        '| Key | Type | Default | Constraints | Group | Description |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows,
      ].join('\n');
    },
    read(extension: seal.ExtInfo): ConfigReadResult<Definitions> {
      const values = {} as PluginConfigValues<Definitions>;
      const issues = [];
      for (const [key, definition] of entries) {
        const value = getterFor(definition)(extension, key);
        const issue = validationIssue(key, definition, value);
        if (issue) {
          issues.push(issue);
          values[key] =
            definition.default as PluginConfigValues<Definitions>[typeof key];
        } else
          values[key] = value as PluginConfigValues<Definitions>[typeof key];
      }
      return { issues, values };
    },
    register(extension: seal.ExtInfo): void {
      for (const [key, definition] of entries)
        registerDefinition(extension, key, definition);
    },
    validate(values: PluginConfigValues<Definitions>): ConfigIssue[] {
      const issues = [];
      for (const [key, definition] of entries) {
        const issue = validationIssue(key, definition, values[key]);
        if (issue) issues.push(issue);
      }
      return issues;
    },
  };
}
