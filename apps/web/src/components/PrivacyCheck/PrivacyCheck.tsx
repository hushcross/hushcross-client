import { motion } from 'framer-motion';
import { useId, useState } from 'react';
import type { PrivacyAssessment } from '../../data/privacyCheck';
import type { PrivacyCheckState } from '../../hooks/usePrivacyCheck';
import { useI18n } from '../../i18n/I18nProvider';
import { PublicActionDialog } from '../Dialog/PublicActionDialog';
import { Icon, type IconName } from '../Icon/Icon';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import styles from './PrivacyCheck.module.css';

const LEVELS = ['good', 'fair', 'weak'] as const;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const DIM = 0.32;
const LEVEL_ICON: Readonly<Record<PrivacyAssessment['level'], IconName>> = { good: 'shield', fair: 'info', weak: 'alert' };

/** Advisory status bar shown above withdraw / send / gift-claim / order confirmations. Never blocks. */
export function PrivacyCheck({ state }: { readonly state: PrivacyCheckState }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const reduced = useReducedMotion();
  if (state.status === 'idle') return null;
  if (state.status === 'checking') {
    return (
      <div className={[styles.bar, styles.checking].join(' ')} role="status">
        <Icon name="shield" size={18} />
        <span className={styles.title}>{t('privacyCheck.checking')}</span>
      </div>
    );
  }
  const { level, findings } = state.assessment;
  const issues = findings.filter((f) => f.severity !== 'info').length;
  return (
    <section className={[styles.wrap, styles[level]].join(' ')} aria-label={t('privacyCheck.title')}>
      <div className={styles.bar}>
        <Icon name={LEVEL_ICON[level]} size={18} className={styles.icon} />
        <div className={styles.text} role="status">
          <span className={styles.title}>
            {t('privacyCheck.title')}: <strong>{t(`privacyCheck.level.${level}`)}</strong>
          </span>
          <span className={styles.summary}>{issues === 0 ? t('privacyCheck.summaryGood') : t('privacyCheck.summaryIssues', { n: issues })}</span>
        </div>
        {findings.length > 0 ? (
          <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
            {open ? t('privacyCheck.hide') : t('privacyCheck.details')}
            <Icon name="chevronRight" size={14} className={open ? styles.chevronOpen : styles.chevron} />
          </button>
        ) : null}
      </div>
      <div className={styles.meter} aria-hidden="true">
        {/* Rules are checked one after another: cells light in turn and the rating settles on one. */}
        {LEVELS.map((cell, i) => {
          const final = LEVELS.indexOf(level);
          const delay = 0.16 * i;
          const animate =
            i < final
              ? { opacity: reduced ? DIM : [DIM, 1, DIM] }
              : i === final
                ? { opacity: 1, scale: reduced ? 1 : [0.94, 1.04, 1] }
                : { opacity: DIM };
          return (
            <motion.span
              key={cell}
              className={[styles.cell, styles[`cell${cap(cell)}`], i === final ? styles.cellActive : ''].join(' ')}
              initial={reduced ? false : { opacity: DIM }}
              animate={animate}
              transition={{ duration: i < final ? 0.5 : 0.36, ease: EASE_OUT, delay: reduced ? 0 : delay }}
            >
              {t(`privacyCheck.level.${cell}`)}
            </motion.span>
          );
        })}
        <motion.span
          className={styles.sweep}
          initial={reduced ? false : { scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 1, opacity: 0 }}
          transition={reduced ? { duration: 0 } : { scaleX: { duration: 0.16 * (LEVELS.indexOf(level) + 1) + 0.2, ease: EASE_OUT }, opacity: { delay: 0.16 * (LEVELS.indexOf(level) + 1) + 0.3, duration: 0.3 } }}
        />
      </div>
      {findings.length > 0 ? (
        <ul className={styles.tags} aria-hidden="true">
          {findings.map((finding, i) => (
            <motion.li
              key={finding.code}
              className={[styles.tag, styles[`tag${cap(finding.severity)}`]].join(' ')}
              initial={reduced ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT, delay: 0.16 * (LEVELS.indexOf(level) + 1) + 0.1 + 0.07 * i }}
            >
              {t(`privacyCheck.tags.${finding.code}`)}
            </motion.li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <ul id={listId} className={styles.list}>
          {findings.map((finding) => (
            <li key={finding.code} className={styles.item}>
              <span className={[styles.dot, styles[`dot${cap(finding.severity)}`]].join(' ')} aria-hidden="true" />
              <div>
                <p className={styles.reason}>
                  <span className="visually-hidden">{t(`privacyCheck.severity.${finding.severity}`)}: </span>
                  {t(`privacyCheck.findings.${finding.code}.reason`, finding.vars)}
                </p>
                <p className={styles.tip}>{t(`privacyCheck.findings.${finding.code}.tip`, finding.vars)}</p>
              </div>
            </li>
          ))}
          <li className={styles.local}>{t('privacyCheck.local')}</li>
        </ul>
      ) : null}
    </section>
  );
}

export interface PrivacyConfirmProps {
  readonly open: boolean;
  readonly assessment: PrivacyAssessment | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
}

/** Second confirmation for obviously deanonymising actions (e.g. sending to your own deposit address). */
export function PrivacyConfirm({ open, assessment, onConfirm, onClose, busy }: PrivacyConfirmProps) {
  const { t } = useI18n();
  const reasons = (assessment?.findings ?? []).filter((f) => f.severity === 'weak').map((f) => t(`privacyCheck.findings.${f.code}.reason`, f.vars));
  return <PublicActionDialog open={open} title={t('privacyCheck.confirmTitle')} description={t('privacyCheck.confirmBody')} reveals={reasons} confirmLabel={t('privacyCheck.confirmCta')} onConfirm={onConfirm} onClose={onClose} busy={busy} />;
}
