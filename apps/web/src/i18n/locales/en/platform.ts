export const platformMessages = {
  platform: {
    toolsLabel: 'Extension tools', openLink: 'Open HushCross link', linkTitle: 'Open a shared link',
    linkBody: 'Paste an official hushcross.fun gift, payment request, campaign or sale link. It opens inside this extension, not in another website tab.',
    linkLabel: 'Official HushCross link', linkPlaceholder: 'https://hushcross.fun/gift#…',
    linkInvalid: 'Use a complete HTTPS link from hushcross.fun for a gift, payment request, campaign or sale. Gift secrets must stay after #, not in a query.',
    secretHint: 'A gift link contains spending secrets. Paste only a link you intend to use, and do not share it in logs or screenshots. The pasted link stays in this page’s memory; opening its destination may read public chain or service data.',
    openLocally: 'Open in this extension',
  },
} as const;
