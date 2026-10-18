import { lazy, Suspense, type ComponentType } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { BookHeroProps } from './BookHero';
import type { GiveLive } from './GiveHero';
import type { JobStageProps } from './JobStage';
import type { LaunchHeroProps } from './LaunchHero';
import styles from './HeroFrame.module.css';

const load = () => import('./index');

/** Same footprint as a loaded hero, so the page does not jump when the chunk arrives. */
export function HeroPlaceholder() {
  const { t } = useI18n();
  return (
    <section className={[styles.hero, styles.placeholder].join(' ')} role="status" aria-label={t('hero.loading')} aria-busy="true">
      <div className={styles.head}>
        <span className={styles.placeholderLine} style={{ width: 96 }} />
        <span className={styles.placeholderLine} style={{ width: '70%', height: 22 }} />
      </div>
      <div className={styles.stage} />
    </section>
  );
}

function withSuspense<P extends object>(Component: ComponentType<P>) {
  return function Lazy(props: P) {
    return (
      <Suspense fallback={<HeroPlaceholder />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

const VaultLazy = lazy(() => load().then((m) => ({ default: m.VaultHero })));
const SendLazy = lazy(() => load().then((m) => ({ default: m.SendHero })));
const GiftLazy = lazy(() => load().then((m) => ({ default: m.GiftHero })));
const LaunchLazy = lazy(() => load().then((m) => ({ default: m.LaunchHero })));
const BookLazy = lazy(() => load().then((m) => ({ default: m.BookHero })));
const GiveLazy = lazy(() => load().then((m) => ({ default: m.GiveHero })));

export const LazyVaultHero = withSuspense<Record<string, never>>(VaultLazy);
export const LazySendHero = withSuspense<Record<string, never>>(SendLazy);
export const LazyGiftHero = withSuspense<Record<string, never>>(GiftLazy);
export const LazyLaunchHero = withSuspense<LaunchHeroProps>(LaunchLazy);
export const LazyBookHero = withSuspense<BookHeroProps>(BookLazy);
export const LazyGiveHero = withSuspense<{ readonly campaign?: GiveLive }>(GiveLazy);

const MiniLazy = lazy(() => load().then((m) => ({ default: m.MiniHero })));

/** Home-page preview; renders an empty tinted stage until the hero chunk arrives. */
export function LazyMiniHero(props: { readonly id: 'vault' | 'send' | 'gift' | 'launch' | 'book' | 'give'; readonly active: boolean }) {
  return (
    <Suspense fallback={<div className={styles.miniPlaceholder} aria-hidden="true" />}>
      <MiniLazy {...props} />
    </Suspense>
  );
}

const JobStageLazy = lazy(() => load().then((m) => ({ default: m.JobStage })));

/** Live job status stage; a tinted placeholder of the same shape until the hero chunk arrives. */
export function LazyJobStage(props: JobStageProps) {
  return (
    <Suspense fallback={<div className={styles.stagePlaceholder} aria-hidden="true" />}>
      <JobStageLazy {...props} />
    </Suspense>
  );
}
