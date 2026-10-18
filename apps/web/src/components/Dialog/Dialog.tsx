import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from '../Icon/Icon';
import styles from './Dialog.module.css';

export interface DialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly tone?: 'default' | 'danger';
  readonly describedBy?: string;
}

/** Below this width dialogs open as bottom sheets (Dialog.module.css uses the same breakpoint). */
export const SHEET_MAX_WIDTH = 600;
/** Dragging a sheet further than this closes it. */
export const SHEET_DISMISS_PX = 96;
const sheetMode = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(`(max-width: ${SHEET_MAX_WIDTH}px)`).matches;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal dialog: focus moves inside, Tab is trapped, Escape closes, focus returns on close. */
export function Dialog({ open, title, onClose, children, footer, tone = 'default', describedBy }: DialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  // Phone bottom sheet: drag the handle (or header) down to dismiss. Direct transform writes, no re-render.
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!sheetMode() || (event.target as HTMLElement).closest('button')) return;
    drag.current = { startY: event.clientY, dy: 0 };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const state = drag.current;
    const node = panel.current;
    if (!state || !node) return;
    state.dy = Math.max(0, event.clientY - state.startY);
    node.style.transform = `translateY(${state.dy}px)`;
  };
  const onPointerUp = (): void => {
    const state = drag.current;
    const node = panel.current;
    drag.current = null;
    if (!state || !node) return;
    if (state.dy > SHEET_DISMISS_PX) {
      onCloseRef.current();
      return;
    }
    node.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';
    node.style.transform = '';
    window.setTimeout(() => {
      node.style.transition = '';
    }, 260);
  };

  if (!open) return null;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} tabIndex={-1} className={[styles.panel, tone === 'danger' ? styles.danger : ''].join(' ')}>
        <span className={styles.handle} aria-hidden="true" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
        <header className={styles.header} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <h2 id={titleId} className={styles.title}>
            {tone === 'danger' ? <Icon name="alert" size={20} className={styles.alertIcon} /> : null}
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
