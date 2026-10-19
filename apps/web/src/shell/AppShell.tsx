import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router';
import { Icon } from '../components/Icon/Icon';
import { Logo } from '../components/Logo/Logo';
import { SocialLinks } from '../components/SocialLinks/SocialLinks';
import { useI18n } from '../i18n/I18nProvider';
import { EASE_EXIT, EASE_OUT, ENTER_S, EXIT_S } from '../motion/easing';
import { useReducedMotion } from '../motion/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { useUiMode } from '../simple/mode';
import { useJobs } from '../simple/jobs/JobsProvider';
import { MORE_PATHS, RAIL_ITEMS, SIMPLE_RAIL_ITEMS, SIMPLE_TAB_ITEMS, TAB_ITEMS } from './navItems';
import styles from './AppShell.module.css';
import { QuickSwitches } from './QuickSwitches';
import { VisitorNotice, useIsVisitor } from '../account/AccountAction';

function ThemeToggle({ withLabel = false }: { readonly withLabel?: boolean }) {
  const { resolved, toggle } = useTheme();
  const { t } = useI18n();
  const label = resolved === 'dark' ? t('shell.useLight') : t('shell.useDark');
  return (
    <button type="button" className={withLabel ? styles.railLink : styles.iconButton} onClick={toggle} aria-label={withLabel ? undefined : label}>
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} />
      {withLabel ? <span>{label}</span> : null}
    </button>
  );
}

/** Top-level module segment: transitions run between modules, not between tabs of one module. */
export const moduleKey = (pathname: string): string => pathname.split('/')[1] ?? '';

function Indicator({ id }: { readonly id: string }) {
  return <motion.span layoutId={id} className={styles.indicator} transition={{ duration: 0.32, ease: EASE_OUT }} aria-hidden="true" />;
}

/** Running-jobs count on the "In progress" nav item; a red dot when one needs attention. */
function JobsBadge({ count, attention }: { readonly count: number; readonly attention: boolean }) {
  const { t } = useI18n();
  return (
    <span className={[styles.badge, attention ? styles.badgeAlert : ''].join(' ')} aria-label={attention ? t('simple.nav.attention') : t('simple.nav.running', { n: count })}>
      {attention ? '!' : count}
    </span>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const reduced = useReducedMotion();
  // v2 art direction: pages settle upward like a turned page (DESIGN_SYSTEM §9.7).
  const offset = reduced ? 0 : 10;
  const { mode } = useUiMode();
  const simple = mode === 'simple';
  const rail = simple ? SIMPLE_RAIL_ITEMS : RAIL_ITEMS;
  const tabs = simple ? SIMPLE_TAB_ITEMS : TAB_ITEMS;
  const { jobs } = useJobs();
  const visitor = useIsVisitor();
  // The runner can still deliver a previous load: locked navigation must not expose its snapshot.
  const running = visitor ? 0 : jobs.filter((j) => j.status === 'running' || j.status === 'waiting').length;
  const attention = !visitor && jobs.some((j) => j.status === 'attention');
  const moreActive = !simple && MORE_PATHS.some((p) => pathname.startsWith(p));
  const firstPage = useRef(true);
  useEffect(() => {
    firstPage.current = false;
  }, []);

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        {t('shell.skip')}
      </a>
      <aside className={styles.rail} aria-label={t('shell.primaryNav')}>
        <NavLink to="/" className={styles.brand} aria-label={t('shell.homeLink')}>
          <Logo />
        </NavLink>
        <nav className={styles.railNav}>
          {rail.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => [styles.railLink, isActive ? styles.active : ''].join(' ')}>
              {({ isActive }) => (
                <>
                  {isActive ? <Indicator id="rail-indicator" /> : null}
                  <Icon name={item.icon} />
                  <span>{t(item.label)}</span>
                  {item.to === '/jobs' && (running > 0 || attention) ? <JobsBadge count={running} attention={attention} /> : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className={styles.railFoot}>
          <SocialLinks variant="icon" className={styles.railSocial} />
          <NavLink to="/docs" className={({ isActive }) => [styles.railLink, isActive ? styles.active : ''].join(' ')}>
            {({ isActive }) => (
              <>
                {isActive ? <Indicator id="rail-indicator" /> : null}
                <Icon name="docs" />
                <span>{t('nav.docs')}</span>
              </>
            )}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => [styles.railLink, isActive ? styles.active : ''].join(' ')}>
            {({ isActive }) => (
              <>
                {isActive ? <Indicator id="rail-indicator" /> : null}
                <Icon name="settings" />
                <span>{t('nav.settings')}</span>
              </>
            )}
          </NavLink>
          <ThemeToggle withLabel />
        </div>
      </aside>

      <header className={styles.topbar}>
        <NavLink to="/" aria-label={t('shell.homeLink')}>
          <span className={styles.logoFull}>
            <Logo />
          </span>
          <span className={styles.logoCompact}>
            <Logo compact />
          </span>
        </NavLink>
        <div className={styles.topActions}>
          <QuickSwitches />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.deskSwitches}>
          <QuickSwitches />
        </div>
        <div className={styles.content}>
          <VisitorNotice />
          {/*
            No AnimatePresence initial={false}: it would also switch off the
            entrance animations of every motion element on the first page
            (heroes, success marks, rolling digits). Only the wrapper skips it.
          */}
          <AnimatePresence mode="wait">
            <motion.div
              key={moduleKey(pathname)}
              initial={firstPage.current ? false : { opacity: 0, y: offset }}
              animate={{ opacity: 1, y: 0, transition: { duration: ENTER_S, ease: EASE_OUT } }}
              exit={{ opacity: 0, y: -offset / 2, transition: { duration: EXIT_S, ease: EASE_EXIT } }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <nav className={styles.tabbar} aria-label={t('shell.tabNav')}>
        {tabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => [styles.tab, isActive || (item.to === '/more' && moreActive) ? styles.tabActive : ''].join(' ')}
          >
            {({ isActive }) => (
              <>
                {isActive || (item.to === '/more' && moreActive) ? <Indicator id="tab-indicator" /> : null}
                <Icon name={item.icon} size={22} />
                <span>{t(item.label)}</span>
                {item.to === '/jobs' && (running > 0 || attention) ? <JobsBadge count={running} attention={attention} /> : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
