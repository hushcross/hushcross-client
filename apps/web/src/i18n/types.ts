import type { en } from './locales/en/index';

/** Message tree shape; every locale must provide exactly these keys. */
export type Messages = DeepString<typeof en>;

type DeepString<T> = { readonly [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Locale = 'en' | 'zh';
export type Vars = Readonly<Record<string, string | number>>;
