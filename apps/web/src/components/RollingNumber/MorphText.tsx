import { RollingNumber } from './RollingNumber';

/** Splits "Mixing · 3 / 5" into text and number runs. */
export function morphParts(text: string): readonly { readonly kind: 'text' | 'number'; readonly value: string }[] {
  return text
    .split(/(\d[\d,.]*\d|\d)/)
    .filter((part) => part !== '')
    .map((part) => ({ kind: /^\d/.test(part) ? ('number' as const) : ('text' as const), value: part }));
}

/** The text with its digits replaced by "#": stays equal while only the numbers change. */
export const morphShape = (text: string): string => text.replace(/\d/g, '#');

/** Text whose numbers roll when they change ("3 / 5" → "4 / 5"); read as plain text. */
export function MorphText({ text }: { readonly text: string }) {
  return (
    <span aria-label={text} role="text">
      {morphParts(text).map((part, i) =>
        part.kind === 'number' ? (
          <span key={i} aria-hidden="true">
            <RollingNumber value={part.value} />
          </span>
        ) : (
          <span key={i} aria-hidden="true">
            {part.value}
          </span>
        ),
      )}
    </span>
  );
}
