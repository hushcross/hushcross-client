import { useSearchParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Tabs } from '../../components/Tabs/Tabs';
import { LazyGiftHero as GiftHero, LazySendHero as SendHero } from '../../heroes/lazy';
import { useI18n } from '../../i18n/I18nProvider';
import styles from '../page.module.css';
import { GiftPanel } from '../gift/GiftPanel';
import { ReceivePanel } from './ReceivePanel';
import { RequestPanel } from './RequestPanel';
import { SendForm } from './SendForm';

type SendTab = 'send' | 'gift' | 'request' | 'receive';
const TABS: readonly SendTab[] = ['send', 'gift', 'request', 'receive'];

export function SendPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: SendTab = TABS.find((x) => x === tabParam) ?? 'send';
  return (
    <div className={styles.stack}>
      <PageHeader title={t('send.title')} subtitle={t('send.subtitle')} />
      {tab === 'gift' ? <GiftHero /> : tab === 'send' ? <SendHero /> : null}
      <Tabs
        label={t('send.tabsLabel')}
        value={tab}
        onChange={(next) => setParams(next === 'send' ? {} : { tab: next }, { replace: true })}
        items={[
          { id: 'send', label: t('send.tabs.send'), content: <SendForm /> },
          { id: 'gift', label: t('send.tabs.gift'), content: <GiftPanel /> },
          { id: 'request', label: t('send.tabs.request'), content: <RequestPanel /> },
          { id: 'receive', label: t('send.tabs.receive'), content: <ReceivePanel /> },
        ]}
      />
    </div>
  );
}
