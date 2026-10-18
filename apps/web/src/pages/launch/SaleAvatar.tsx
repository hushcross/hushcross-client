import { SaleLogo, type SaleLogoSize } from '../../components/SaleLogo/SaleLogo';
import type { Address } from '../../data/types';
import { useSaleProfile } from './useSaleProfile';

/** Logo of a sale from its verified profile; the monogram until (or unless) one verifies. */
export function SaleAvatar({ sale, symbol, size = 'md', label }: { readonly sale: Address | null | undefined; readonly symbol: string; readonly size?: SaleLogoSize; readonly label?: string }) {
  const profile = useSaleProfile(sale).data ?? null;
  const src = size === 'sm' || size === 'md' ? (profile?.logoSmallUrl ?? profile?.logoUrl ?? null) : (profile?.logoUrl ?? null);
  return <SaleLogo symbol={symbol} src={src} size={size} label={label} />;
}
