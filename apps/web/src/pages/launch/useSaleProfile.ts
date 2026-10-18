import { useResource, type Resource } from '../../data/DataProvider';
import type { Address, SaleProfile } from '../../data/types';

/** Verified profile of a sale (null = none or not verifiable: show the monogram). */
export function useSaleProfile(sale: Address | null | undefined): Resource<SaleProfile | null> {
  return useResource((source) => (sale ? source.getSaleProfile(sale) : Promise.resolve(null)), ['sales'], [sale ?? '']);
}
