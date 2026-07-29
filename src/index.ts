import { sample } from 'lodash-es';

import extensionMetadata from '../extension.json';

import { nameList } from './utils.ts';

function main(): void {
  const existingExtension = seal.ext.find(extensionMetadata.id);
  const extension =
    existingExtension ??
    seal.ext.new(
      extensionMetadata.id,
      extensionMetadata.author,
      extensionMetadata.version,
    );
  if (existingExtension === null) {
    seal.ext.register(extension);
  }

  const cmdSeal = seal.ext.newCmdItemInfo();
  cmdSeal.name = 'seal';
  cmdSeal.help = '召唤一只海豹，可用.seal <名字> 命名';

  cmdSeal.solve = (ctx, msg, cmdArgs): seal.CmdExecuteResult => {
    const value = cmdArgs.getArgN(1);
    switch (value) {
      case 'help': {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        const name = value === '' ? (sample(nameList) ?? '无名海豹') : value;
        const escapeDesire = String(Math.ceil(Math.random() * 100));
        seal.replyToSender(
          ctx,
          msg,
          `你抓到一只海豹！取名为${name}\n它的逃跑意愿为${escapeDesire}`,
        );
        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  extension.cmdMap['seal'] = cmdSeal;
}

main();
