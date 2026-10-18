import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandIcon } from '../../components/Brand/BrandIcon';
import { Coin } from '../../components/Coin/Coin';
import { Icon } from '../../components/Icon/Icon';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { SocialLinks } from '../../components/SocialLinks/SocialLinks';
import { appConfig } from '../../config';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { DocsContracts, loadConfiguredDeployments, type LoadContracts } from './DocsContracts';
import { DOCS_SECTIONS, FAQ_ITEMS, FEE_ROWS, MODULE_CONTENT, PRIVATE_POINTS, PUBLIC_POINTS, type DocsSectionId, type DocsSectionMeta, type ModuleId } from './docsContent';
import styles from './Docs.module.css';

const anchor = (id: DocsSectionId): string => `docs-${id}`;
const k = (path: string): MessageKey => `docs.sections.${path}` as MessageKey;

export interface DocsPageProps {
  /** Where the contract addresses come from; the app's deployments file by default. */
  readonly loadContracts?: LoadContracts;
  readonly githubUrl?: string;
  readonly xUrl?: string;
}

/** The last section whose top has passed a line near the top of the viewport. */
function useActiveSection(): DocsSectionId {
  const [active, setActive] = useState<DocsSectionId>('overview');
  useEffect(() => {
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const line = Math.min(160, window.innerHeight * 0.25);
      let current: DocsSectionId = 'overview';
      for (const section of DOCS_SECTIONS) {
        const el = document.getElementById(anchor(section.id));
        if (el && el.getBoundingClientRect().top <= line) current = section.id;
      }
      // At the very bottom the last sections may never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = DOCS_SECTIONS[DOCS_SECTIONS.length - 1]?.id ?? current;
      setActive(current);
    };
    const onScroll = (): void => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}

function TocLinks({ active, onPick }: { readonly active: DocsSectionId; readonly onPick: (e: MouseEvent<HTMLAnchorElement>, id: DocsSectionId) => void }) {
  const { t } = useI18n();
  return (
    <ol className={styles.tocList}>
      {DOCS_SECTIONS.map((section) => (
        <li key={section.id}>
          <a href={`#${anchor(section.id)}`} className={[styles.tocLink, active === section.id ? styles.tocActive : ''].join(' ')} aria-current={active === section.id ? 'location' : undefined} onClick={(e) => onPick(e, section.id)}>
            {t(k(`${section.id}.title`))}
          </a>
        </li>
      ))}
    </ol>
  );
}

function Section({ meta, index, children }: { readonly meta: DocsSectionMeta; readonly index: number; readonly children: ReactNode }) {
  const { t } = useI18n();
  const headingId = `${anchor(meta.id)}-title`;
  return (
    <section id={anchor(meta.id)} className={styles.section} aria-labelledby={headingId}>
      <header className={styles.sectionHead}>
        <Coin icon={meta.icon} tone={meta.tone} />
        <div className={styles.sectionHeadText}>
          <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
          <h2 id={headingId} className={styles.sectionTitle}>
            {t(k(`${meta.id}.title`))}
          </h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function ModuleBody({ id }: { readonly id: ModuleId }) {
  const { t } = useI18n();
  const content = MODULE_CONTENT[id];
  return (
    <>
      <p className={styles.lead}>{t(k(`${id}.lead`))}</p>
      <div className={styles.moduleGrid}>
        <div>
          <h3 className={styles.subhead}>{t('docs.howItWorks')}</h3>
          <ol className={styles.steps}>
            {content.steps.map((leaf) => (
              <li key={leaf}>{t(k(`${id}.steps.${leaf}`))}</li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className={styles.subhead}>{t('docs.keyParams')}</h3>
          <dl className={styles.params}>
            {content.params.map((leaf) => (
              <div key={leaf} className={styles.param}>
                <dt>{t(k(`${id}.params.${leaf}.label`))}</dt>
                <dd>{t(k(`${id}.params.${leaf}.value`))}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );
}

function OverviewBody() {
  const { t } = useI18n();
  return (
    <>
      <div className={styles.prose}>
        <p>{t('docs.sections.overview.p1')}</p>
        <p>{t('docs.sections.overview.p2')}</p>
      </div>
      <div className={styles.modes}>
        <div className={styles.mode}>
          <h3 className={styles.modeTitle}>{t('docs.sections.overview.simpleTitle')}</h3>
          <p>{t('docs.sections.overview.simpleBody')}</p>
        </div>
        <div className={styles.mode}>
          <h3 className={styles.modeTitle}>{t('docs.sections.overview.proTitle')}</h3>
          <p>{t('docs.sections.overview.proBody')}</p>
        </div>
      </div>
      <p className={styles.quiet}>{t('docs.sections.overview.modes')}</p>
    </>
  );
}

function PrivacyBody() {
  const { t } = useI18n();
  return (
    <>
      <div className={styles.privacyGrid}>
        <div className={styles.privacyCol}>
          <h3 className={styles.subhead}>
            <Icon name="eyeOff" size={16} />
            {t('docs.sections.privacy.privateTitle')}
          </h3>
          <ul className={styles.points}>
            {PRIVATE_POINTS.map((leaf) => (
              <li key={leaf}>{t(k(`privacy.private.${leaf}`))}</li>
            ))}
          </ul>
        </div>
        <div className={styles.privacyCol}>
          <h3 className={styles.subhead}>
            <Icon name="eye" size={16} />
            {t('docs.sections.privacy.publicTitle')}
          </h3>
          <ul className={styles.points}>
            {PUBLIC_POINTS.map((leaf) => (
              <li key={leaf}>{t(k(`privacy.public.${leaf}`))}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className={styles.quiet}>{t('docs.sections.privacy.note')}</p>
    </>
  );
}

function FeesBody() {
  const { t } = useI18n();
  return (
    <div className={styles.ledgerCard}>
      <table className={styles.fees}>
        <thead>
          <tr>
            <th scope="col">{t('docs.sections.fees.what')}</th>
            <th scope="col">{t('docs.sections.fees.fee')}</th>
            <th scope="col">{t('docs.sections.fees.payer')}</th>
          </tr>
        </thead>
        <tbody>
          {FEE_ROWS.map((row) => (
            <tr key={row}>
              <th scope="row">{t(k(`fees.rows.${row}.what`))}</th>
              <td className={styles.feeValue}>{t(k(`fees.rows.${row}.fee`))}</td>
              <td>{t(k(`fees.rows.${row}.payer`))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FaqBody() {
  const { t } = useI18n();
  return (
    <div className={styles.faq}>
      {FAQ_ITEMS.map((item) => (
        <details key={item} className={styles.faqItem}>
          <summary>
            <span>{t(k(`faq.items.${item}.q`))}</span>
            <Icon name="plus" size={16} className={styles.faqMark} />
          </summary>
          <p>{t(k(`faq.items.${item}.a`))}</p>
        </details>
      ))}
    </div>
  );
}

/** Reference for every module, the fees and the deployed contracts. Readable without an account. */
export function DocsPage({ loadContracts = loadConfiguredDeployments, githubUrl = appConfig.githubUrl, xUrl = appConfig.xUrl }: DocsPageProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const active = useActiveSection();
  const mobileToc = useRef<HTMLDetailsElement>(null);

  const pick = (e: MouseEvent<HTMLAnchorElement>, id: DocsSectionId): void => {
    const el = document.getElementById(anchor(id));
    if (!el || typeof el.scrollIntoView !== 'function') return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (mobileToc.current) mobileToc.current.open = false;
  };

  const body = (meta: DocsSectionMeta): ReactNode => {
    switch (meta.id) {
      case 'overview':
        return <OverviewBody />;
      case 'privacy':
        return <PrivacyBody />;
      case 'fees':
        return <FeesBody />;
      case 'contracts':
        return (
          <>
            <p className={styles.lead}>{t('docs.sections.contracts.intro')}</p>
            <DocsContracts load={loadContracts} githubUrl={githubUrl} />
          </>
        );
      case 'faq':
        return <FaqBody />;
      default:
        return <ModuleBody id={meta.id} />;
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader kicker={t('docs.kicker')} title={t('docs.title')} subtitle={t('docs.subtitle')} leading={<Coin icon="docs" tone="accent" size="sm" />} />

      <details ref={mobileToc} className={styles.tocMobile}>
        <summary>
          <span>{t('docs.toc')}</span>
          <Icon name="chevronRight" size={16} className={styles.tocChevron} />
        </summary>
        <nav aria-label={t('docs.toc')}>
          <TocLinks active={active} onPick={pick} />
        </nav>
      </details>

      <div className={styles.layout}>
        <aside className={styles.tocDesk}>
          <nav aria-label={t('docs.toc')}>
            <p className={['eyebrow', styles.tocTitle].join(' ')}>{t('docs.toc')}</p>
            <TocLinks active={active} onPick={pick} />
          </nav>
        </aside>

        <div className={styles.body}>
          {DOCS_SECTIONS.map((meta, index) => (
            <Section key={meta.id} meta={meta} index={index}>
              {body(meta)}
            </Section>
          ))}

          <footer className={styles.footer}>
            <h2 className={styles.footerTitle}>{t('docs.next.title')}</h2>
            <div className={styles.nextGrid}>
              <Link to="/about" className={styles.nextCard}>
                <Coin icon="info" tone="neutral" size="sm" />
                <span className={styles.nextText}>
                  <span className={styles.nextTitle}>{t('about.link')}</span>
                  <span className={styles.nextBody}>{t('docs.next.about')}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </Link>
              <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={styles.nextCard}>
                <span className={styles.nextMark}>
                  <BrandIcon name="github" size={18} />
                </span>
                <span className={styles.nextText}>
                  <span className={styles.nextTitle}>{t('docs.next.github')}</span>
                  <span className={styles.nextBody}>{t('docs.next.githubBody')}</span>
                </span>
                <Icon name="external" size={16} />
              </a>
            </div>
            <div className={styles.follow}>
              <span className="eyebrow">{t('docs.next.follow')}</span>
              <SocialLinks githubUrl={githubUrl} xUrl={xUrl} />
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
