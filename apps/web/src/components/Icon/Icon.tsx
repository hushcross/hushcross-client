import type { SVGProps } from 'react';

/** Line icons drawn for HushCross: 24-unit grid, 1.5px stroke, rendered at 20px. */
const paths = {
  home: 'M4.5 10.2 12 4.5l7.5 5.7v8.3a1.5 1.5 0 0 1-1.5 1.5h-3.25v-5.25h-5.5V20H6a1.5 1.5 0 0 1-1.5-1.5z',
  // Product set (v2 art direction): one 1.5px stroke, rounded joins, a 3px inner margin.
  vault: 'M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM7.5 18.5V20M16.5 18.5V20M11 8a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM11 11.5h.01M16.5 9.5v4',
  send: 'M6.5 17.5 17 7M9.5 7H17v7.5',
  receive: 'M17.5 6.5 7 17M14.5 17H7V9.5M4.5 20h15',
  launch: 'M5 19 9.5 14.5M14 4.5c3 0 5.5 2.5 5.5 5.5L13 16.5 7.5 11zM7.5 11 4.5 11.5l3-4h4M13 16.5l-.5 3 4-3v-4',
  sale: 'M4 7a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 7v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17zM4.5 6.5l7.5 6 7.5-6M12 12.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z',
  redPacket: 'M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5zM5 8.5c2.1 1.7 4.4 2.5 7 2.5s4.9-.8 7-2.5M12 11.25a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  book: 'M4 7h16M4 12h16M4 17h16M8 4.5v5M16 9.5v5M11 14.5v5',
  give: 'M12 19.5s-7.5-4.4-7.5-9.7A4 4 0 0 1 12 7.6a4 4 0 0 1 7.5 2.2c0 5.3-7.5 9.7-7.5 9.7z',
  mix: 'M4.5 7c6 0 9 10 15 10M4.5 17c6 0 9-10 15-10M17 4.5 19.5 7 17 9.5M17 14.5l2.5 2.5-2.5 2.5',
  passkey: 'M7.2 9.5a5.2 5.2 0 0 1 9.6 1.5c.3 2.6-.1 5.3-1.3 7.8M12 11v1.5c0 2.6-.7 5-2.1 7M9.4 12.5c0 1.9-.4 3.6-1.3 5.2M14.6 13.5c0 1.4-.2 2.7-.6 4M4.8 13.5c.3-1.6.2-3.4.9-4.9A7 7 0 0 1 18.4 7.5M19 11.2c.1 1 .1 2-.1 3',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  settings: 'M12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM19 12l1.6-1.2-1.7-3-1.9.7a6.9 6.9 0 0 0-1.6-.9L15 5.5h-3.4l-.4 2.1a6.9 6.9 0 0 0-1.6.9l-1.9-.7-1.7 3L7.6 12 6 13.2l1.7 3 1.9-.7c.5.4 1 .7 1.6.9l.4 2.1H15l.4-2.1c.6-.2 1.1-.5 1.6-.9l1.9.7 1.7-3z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  external: 'M14 5h5v5M19 5l-8 8M17 14v5H5V7h5',
  check: 'M5 12.5 10 17.5 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  sun: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
  chevronRight: 'M9.5 6l6 6-6 6',
  chevronLeft: 'M14.5 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff: 'M4 4l16 16M10 6c.6-.1 1.3-.2 2-.2 6 0 9.5 6.2 9.5 6.2a16 16 0 0 1-2.6 3.3M6.4 7.5A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.6-.3 3.7-.8M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6',
  shield: 'M12 3.5c2.2 1.5 4.6 2.3 7 2.5v5.5c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6c2.4-.2 4.8-1 7-2.5zM12 8v8',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 1.8',
  qr: 'M4.5 4.5h5v5h-5zM14.5 4.5h5v5h-5zM4.5 14.5h5v5h-5zM14.5 14.5h2v2h-2zM18.5 18.5h1v1h-1zM14.5 18.5h1M18.5 14.5h1',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  key: 'M8.5 15.5a4 4 0 1 1 2.8-6.8L20 8v3.5h-2.5V14H15l-1.7-1.7',
  globe: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z',
  info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01',
  alert: 'M12 4.5 21 19.5H3zM12 10v4M12 17h.01',
  arrowDown: 'M12 5v14M6.5 13.5 12 19l5.5-5.5',
  arrowUp: 'M12 19V5M6.5 10.5 12 5l5.5 5.5',
  refresh: 'M19 12a7 7 0 0 1-12.2 4.7M5 12a7 7 0 0 1 12.2-4.7M17.5 4v3.5H14M6.5 20v-3.5H10',
  receipt: 'M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5zM9 8h6M9 11.5h6M9 15h3',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5v10A1.5 1.5 0 0 0 5.5 19H20V8H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01',
  gift: 'M4 9.5h16v3H4zM5.5 12.5v8h13v-8M12 9.5v11M12 9.5S10.8 5 8.5 5a2 2 0 0 0 0 4.5M12 9.5S13.2 5 15.5 5a2 2 0 0 1 0 4.5',
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  docs: 'M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5zM13.5 3.5V8.5h5M8.5 12.5h7M8.5 16h5',
  seal: 'M12 3.5l2 1.6 2.5-.3 1 2.3 2.3 1-.3 2.5 1.6 2-1.6 2 .3 2.5-2.3 1-1 2.3-2.5-.3-2 1.6-2-1.6-2.5.3-1-2.3-2.3-1 .3-2.5L3.5 12l1.6-2-.3-2.5 2.3-1 1-2.3 2.5.3zM9 12l2 2 4-4',
} as const;

export type IconName = keyof typeof paths;

/** Every icon in the set, for the /dev/ui sheet. */
export const ICON_NAMES = Object.keys(paths) as readonly IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: IconName;
  readonly size?: number;
  /** Accessible label; omit for decorative icons. */
  readonly label?: string;
}

export function Icon({ name, size = 20, label, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
