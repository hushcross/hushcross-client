import { MotionConfig } from 'framer-motion';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { appConfig } from './config';
import { Route, Routes } from 'react-router';
import { AppRouter } from './platform/AppRouter';
import { IS_EXTENSION } from './platform/runtime';
import { ToastProvider } from './components/Toast/Toast';
import { DataProvider } from './data/DataProvider';
import type { DataSource } from './data/DataSource';
import { MockDataSource } from './data/mock/MockDataSource';
import { I18nProvider } from './i18n/I18nProvider';
import { PreferencesProvider } from './lib/preferences';
import { NotFoundPage } from './pages/NotFoundPage';
import { AppShell } from './shell/AppShell';
import { JobsProvider } from './simple/jobs/JobsProvider';
import { ModeProvider, useUiMode } from './simple/mode';
import { SimpleHome } from './simple/pages/SimpleHome';
import type { JobStore } from '@hushcross/core';
import { ThemeProvider } from './theme/ThemeProvider';
import { DemoBanner } from './shell/DemoBanner';
import { InstallProvider } from './pwa/InstallProvider';
import { UpdateNotice } from './pwa/UpdateNotice';

// Simple-mode screens other than Home load on demand (their own chunk).
const simplePage = <K extends 'DonateWizard' | 'GiftWizard' | 'JobPage' | 'JobsPage' | 'ReceivePage' | 'SaleWizard' | 'SendWizard' | 'TradeWizard'>(name: K) =>
  lazy(() => import('./simple/pages/index').then((m) => ({ default: m[name] })));
const SendWizard = simplePage('SendWizard');
const ReceivePage = simplePage('ReceivePage');
const GiftWizard = simplePage('GiftWizard');
const SaleWizard = simplePage('SaleWizard');
const TradeWizard = simplePage('TradeWizard');
const DonateWizard = simplePage('DonateWizard');
const JobsPage = simplePage('JobsPage');
const JobPage = simplePage('JobPage');


// Pro-mode and secondary screens load on demand, one chunk per route (keeps the first load small).
const BookPage = lazy(() => import('./pages/book/BookPage').then((m) => ({ default: m.BookPage })));
const DevHeroesPage = lazy(() => import('./pages/dev/DevHeroesPage').then((m) => ({ default: m.DevHeroesPage })));
const DevOnboardingPage = lazy(() => import('./pages/dev/DevOnboardingPage').then((m) => ({ default: m.DevOnboardingPage })));
const DevUiPage = lazy(() => import('./pages/dev/DevUiPage').then((m) => ({ default: m.DevUiPage })));
const ClaimGiftPage = lazy(() => import('./pages/gift/ClaimGiftPage').then((m) => ({ default: m.ClaimGiftPage })));
const CampaignDetailPage = lazy(() => import('./pages/give/CampaignDetailPage').then((m) => ({ default: m.CampaignDetailPage })));
const CreateCampaignPage = lazy(() => import('./pages/give/CreateCampaignPage').then((m) => ({ default: m.CreateCampaignPage })));
const GivePage = lazy(() => import('./pages/give/GivePage').then((m) => ({ default: m.GivePage })));
const HomePage = lazy(() => import('./pages/home/HomePage').then((m) => ({ default: m.HomePage })));
const CreateSalePage = lazy(() => import('./pages/launch/CreateSalePage').then((m) => ({ default: m.CreateSalePage })));
const LaunchPage = lazy(() => import('./pages/launch/LaunchPage').then((m) => ({ default: m.LaunchPage })));
const SaleDetailPage = lazy(() => import('./pages/launch/SaleDetailPage').then((m) => ({ default: m.SaleDetailPage })));
const MorePage = lazy(() => import('./pages/more/MorePage').then((m) => ({ default: m.MorePage })));
const PrivacyPage = lazy(() => import('./pages/privacy/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const PublicPrivacyPage = lazy(() => import('./pages/privacy/PrivacyPage').then((m) => ({ default: m.PublicPrivacyPage })));
const AboutPage = lazy(() => import('./pages/about/AboutPage').then((m) => ({ default: m.AboutPage })));
const DocsPage = lazy(() => import('./pages/docs/DocsPage').then((m) => ({ default: m.DocsPage })));
const PayPage = lazy(() => import('./pages/send/PayPage').then((m) => ({ default: m.PayPage })));
const SendPage = lazy(() => import('./pages/send/SendPage').then((m) => ({ default: m.SendPage })));
const AppInstallPage = lazy(() => import('./pages/app/AppInstallPage').then((m) => ({ default: m.AppInstallPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const VaultPage = lazy(() => import('./pages/vault/VaultPage').then((m) => ({ default: m.VaultPage })));

function Lazy({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** Simple mode (default) opens on the action tiles; Pro mode on the module dashboard. */
function Home() {
  const { mode } = useUiMode();
  return mode === 'simple' ? <SimpleHome /> : <Lazy><HomePage /></Lazy>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="do/send" element={<Lazy><SendWizard /></Lazy>} />
        <Route path="do/receive" element={<Lazy><ReceivePage /></Lazy>} />
        <Route path="do/gift" element={<Lazy><GiftWizard /></Lazy>} />
        <Route path="do/sale" element={<Lazy><SaleWizard /></Lazy>} />
        <Route path="do/trade" element={<Lazy><TradeWizard /></Lazy>} />
        <Route path="do/donate" element={<Lazy><DonateWizard /></Lazy>} />
        <Route path="jobs" element={<Lazy><JobsPage /></Lazy>} />
        <Route path="jobs/:id" element={<Lazy><JobPage /></Lazy>} />
        <Route path="vault" element={<Lazy><VaultPage /></Lazy>} />
        <Route path="send" element={<Lazy><SendPage /></Lazy>} />
        <Route path="pay/:hushId" element={<Lazy><PayPage /></Lazy>} />
        <Route path="gift" element={<Lazy><ClaimGiftPage /></Lazy>} />
        <Route path="launch" element={<Lazy><LaunchPage /></Lazy>} />
        <Route path="launch/new" element={<Lazy><CreateSalePage /></Lazy>} />
        <Route path="launch/:saleId" element={<Lazy><SaleDetailPage /></Lazy>} />
        <Route path="book" element={<Lazy><BookPage /></Lazy>} />
        <Route path="give" element={<Lazy><GivePage /></Lazy>} />
        <Route path="give/new" element={<Lazy><CreateCampaignPage /></Lazy>} />
        <Route path="give/:campaignId" element={<Lazy><CampaignDetailPage /></Lazy>} />
        <Route path="app" element={<Lazy><AppInstallPage /></Lazy>} />
        <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
        <Route path="more" element={<Lazy><MorePage /></Lazy>} />
        <Route path="about" element={<Lazy><AboutPage /></Lazy>} />
        <Route path="privacy" element={<Lazy><PrivacyPage /></Lazy>} />
        <Route path="docs" element={<Lazy><DocsPage /></Lazy>} />
        <Route path="dev/ui" element={<Lazy><DevUiPage /></Lazy>} />
        <Route path="dev/heroes" element={<Lazy><DevHeroesPage /></Lazy>} />
        <Route path="dev/onboarding" element={<Lazy><DevOnboardingPage /></Lazy>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export interface AppProvidersProps {
  readonly source: DataSource;
  readonly children: ReactNode;
  /** Where one-step jobs persist (the chain app passes the vault-backed store); in memory by default. */
  readonly jobStore?: JobStore;
  readonly subscribeJobStore?: (listener: () => void) => () => void;
  /** Background job tick interval (tests shorten it). */
  readonly jobPollMs?: number;
}

/** Providers shared by the app and tests. Swap `source` for the on-chain implementation. */
export function AppProviders({ source, children, jobStore, subscribeJobStore, jobPollMs }: AppProvidersProps) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <I18nProvider>
          <InstallProvider>
            <PreferencesProvider>
              <ModeProvider>
                <DataProvider source={source}>
                  <ToastProvider>
                    <JobsProvider {...(jobStore ? { store: jobStore } : {})} {...(subscribeJobStore ? { subscribeStore: subscribeJobStore } : {})} {...(jobPollMs ? { pollMs: jobPollMs } : {})}>
                      {children}
                      <UpdateNotice />
                    </JobsProvider>
                  </ToastProvider>
                </DataProvider>
              </ModeProvider>
            </PreferencesProvider>
          </InstallProvider>
        </I18nProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

const ChainApp = lazy(() => import('./chain/ChainApp').then((m) => ({ default: m.ChainApp })));

export function App() {
  // Public policy must not depend on a working chain configuration or an unlocked account.
  if (!IS_EXTENSION && /^\/privacy\/?$/.test(window.location.pathname)) return <Lazy><PublicPrivacyPage /></Lazy>;
  if (appConfig.dataSource !== 'chain') return <MockApp />;
  return (
    <Suspense fallback={null}>
      <ChainApp config={appConfig} />
    </Suspense>
  );
}

function MockApp() {
  // `?mock=new` starts the demo as a brand-new account (no backup yet), for reviewing onboarding prompts.
  const source = useMemo<DataSource>(() => new MockDataSource({ fresh: new URLSearchParams(window.location.search).get('mock') === 'new' }), []);
  return (
    <AppProviders source={source}>
      <DemoBanner />
      <AppRouter>
        <AppRoutes />
      </AppRouter>
    </AppProviders>
  );
}
