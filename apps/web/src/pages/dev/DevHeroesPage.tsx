import { useSearchParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ClaimCelebration } from '../gift/ClaimCelebration';
import { LazyBookHero, LazyGiftHero, LazyGiveHero, LazyLaunchHero, LazySendHero, LazyVaultHero } from '../../heroes/lazy';
import styles from '../page.module.css';

const ALL = {
  vault: () => <LazyVaultHero />,
  send: () => <LazySendHero />,
  gift: () => <LazyGiftHero />,
  launch: () => <LazyLaunchHero />,
  'launch-sealed': () => <LazyLaunchHero sealedCount={183} quote="BNB" />,
  book: () => <LazyBookHero />,
  'book-out': () => <LazyBookHero buys={[{ price: 621, amount: 3 }, { price: 618, amount: 4 }, { price: 615, amount: 2 }]} sells={[{ price: 612, amount: 3 }, { price: 616, amount: 4 }, { price: 620, amount: 2 }]} reference={598.4} />,
  give: () => <LazyGiveHero />,
  claim: () => <ClaimCelebration amount="20" asset="USDT" message="20 USDT is on its way to your vault." />,
} as const;

type HeroKey = keyof typeof ALL;

/** Review gallery for mechanism animations: `/dev/heroes?only=vault&heroAt=0.5`. */
export function DevHeroesPage() {
  const [params] = useSearchParams();
  const only = params.get('only');
  const keys = (Object.keys(ALL) as HeroKey[]).filter((key) => only === null || key === only);
  return (
    <div className={styles.stack}>
      <PageHeader title="Heroes" subtitle="Mechanism animations, for review." />
      {keys.map((key) => (
        <div key={key}>{ALL[key]()}</div>
      ))}
    </div>
  );
}
