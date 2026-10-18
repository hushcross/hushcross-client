import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'lg';

interface CommonProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: IconName;
  readonly iconEnd?: IconName;
  readonly block?: boolean;
  readonly children?: ReactNode;
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly loading?: boolean;
}

export function buttonClass({ variant = 'primary', size = 'md', block = false }: Pick<CommonProps, 'variant' | 'size' | 'block'>): string {
  return [styles.button, styles[variant], styles[size], block ? styles.block : ''].filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, iconEnd, block, loading = false, disabled, children, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[buttonClass({ variant, size, block }), className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </button>
  );
});

export function ButtonLink({ variant, size, icon, iconEnd, block, children, className, ...rest }: CommonProps & LinkProps) {
  return (
    <Link className={[buttonClass({ variant, size, block }), className].filter(Boolean).join(' ')} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </Link>
  );
}
