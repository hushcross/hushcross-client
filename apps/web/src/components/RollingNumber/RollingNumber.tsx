import { motion } from 'framer-motion';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import styles from './RollingNumber.module.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Renders a formatted number whose digits roll vertically when the value
 * changes. With `rollIn`, digits also roll up from 0 on first render, the
 * last digit first, like an odometer settling.
 */
export function RollingNumber({ value, className, rollIn = false }: { readonly value: string; readonly className?: string; readonly rollIn?: boolean }) {
  const reduced = useReducedMotion();
  const chars = value.split('');
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  let seen = 0;
  return (
    <span className={[styles.number, className].filter(Boolean).join(' ')} aria-label={value} role="text">
      {chars.map((char, index) => {
        const key = `${chars.length - index}`;
        if (!/\d/.test(char)) {
          return (
            <span key={key} className={styles.static} aria-hidden="true">
              {char}
            </span>
          );
        }
        seen += 1;
        const fromEnd = digitCount - seen;
        return (
          <span key={key} className={styles.slot} aria-hidden="true">
            <span className={styles.ghost}>{char}</span>
            <motion.span
              className={styles.strip}
              initial={rollIn && !reduced ? { y: '0%' } : false}
              animate={{ y: `${-Number(char) * 10}%` }}
              transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE_OUT, delay: rollIn ? 0.08 + fromEnd * 0.06 : 0 }}
            >
              {DIGITS.map((d) => (
                <span key={d} className={styles.digit}>
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
