export const platformMessages = {
  platform: {
    toolsLabel: '扩展工具', openLink: '打开 HushCross 链接', linkTitle: '打开分享链接',
    linkBody: '粘贴 hushcross.fun 官方域名的红包、收款请求、活动或发售完整链接。链接将在此扩展内打开，不会跳转到另一个网站标签页。',
    linkLabel: 'HushCross 官方链接', linkPlaceholder: 'https://hushcross.fun/gift#…',
    linkInvalid: '请使用 hushcross.fun 的 HTTPS 完整红包、收款请求、活动或发售链接。红包秘密必须留在 # 后，不能放在查询参数中。',
    secretHint: '红包链接包含花费秘密。仅粘贴你准备使用的链接，不要将其写入日志或截图。粘贴的链接只保留在本页内存中；打开目标页面后可能读取公开链上或服务数据。',
    openLocally: '在此扩展中打开',
  },
} as const;
