const extension = seal.ext.new('grouped-config-contract', 'SealDice', '1.0.0');

seal.ext.registerStringConfig(
  extension,
  'title',
  'SealDice extension',
  'Display title',
  'Appearance',
);
seal.ext.registerTask(
  extension,
  'daily',
  '08:30',
  () => {},
  'daily-reminder',
  'Daily reminder',
  'Schedules',
);

const config: seal.ConfigItem = {
  defaultValue: 'SealDice extension',
  deprecated: false,
  description: 'Display title',
  group: 'Appearance',
  key: 'title',
  option: null,
  type: 'string',
  value: 'SealDice extension',
};

void config;
