function verifyApiContract(ctx: seal.MsgContext, msg: seal.Message): void {
  const extension = seal.ext.new('contract-test', 'SealDice', '1.0.0');
  const command = seal.ext.newCmdItemInfo();
  command.solve = (commandCtx, commandMsg, commandArgs) => {
    void commandCtx;
    void commandMsg;
    void commandArgs.specialExecuteTimes;
    return seal.ext.newCmdExecuteResult(true);
  };
  extension.cmdMap['contract'] = command;
  extension.onPoke = (eventCtx, event) => {
    void eventCtx;
    void event.groupId;
  };
  extension.getDescText = (currentExtension) => currentExtension.name;
  seal.ext.register(extension);

  seal.ext.registerStringConfig(
    extension,
    'title',
    'SealDice extension',
    'Display title',
  );
  const config = seal.ext.getConfig(extension, 'title');
  if (config !== null) {
    void config.description;
  }

  const task = seal.ext.registerTask(
    extension,
    'daily',
    '08:30',
    (taskContext) => {
      void taskContext.now;
      void taskContext.key;
    },
  );
  void task.off();
  void task.on();

  const rule = seal.coc.newRule();
  rule.check = (ruleContext, d100, checkValue, difficultyRequired) => {
    void ruleContext;
    return {
      successRank: d100 + checkValue + difficultyRequired,
      criticalSuccessValue: d100,
    };
  };

  const extensionOrNull: seal.ExtInfo | null = seal.ext.find('missing');
  const banEntryOrNull: seal.BanListInfoItem | null =
    seal.ban.getUser('missing');
  void extensionOrNull;
  void banEntryOrNull;
  void seal.vars.computedGet(ctx, '$tComputed');
  seal.vars.computedSet(ctx, '$tComputed', '1d100');
  void seal.deck.draw(ctx, 'deck', true);
  seal.deck.reload();
  seal.replyToSender(ctx, msg, 'ok');
}

void verifyApiContract;
