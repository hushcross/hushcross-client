import { privacyMessages } from './privacy';
import { platformMessages } from './platform';
import { appInstallMessages } from './appInstall';
import type { Messages } from '../../types';
import { accountMessages } from './account';
import { bookGiveMessages } from './bookgive';
import { core } from './core';
import { giftMessages } from './gift';
import { giveMessages } from './give';
import { heroMessages } from './hero';
import { marketMessages } from './markets';
import { oneTimeMessages } from './onetime';
import { sendMessages } from './send';
import { simpleMessages } from './simple';
import { tradeMessages } from './trade';
import { guideMessages } from './guide';
import { aboutMessages } from './about';
import { vaultMessages } from './vault';
import { saleProfileMessages } from './saleprofile';
import { docsMessages } from './docs';

/** Simplified Chinese catalogue; must mirror en key-for-key, in the same order. */
export const zh: Messages = {
  ...core,
  ...vaultMessages,
  ...sendMessages,
  ...giftMessages,
  ...marketMessages,
  ...giveMessages,
  ...bookGiveMessages,
  ...heroMessages,
  ...accountMessages,
  ...simpleMessages,
  ...tradeMessages,
  ...guideMessages,
  ...aboutMessages,
  ...oneTimeMessages,
  ...saleProfileMessages,
  ...docsMessages,
  ...appInstallMessages,
  ...platformMessages,
  ...privacyMessages,
};
