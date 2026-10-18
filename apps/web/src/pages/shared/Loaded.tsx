import type { ReactNode } from 'react';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import type { Resource } from '../../data/DataProvider';
import { useI18n } from '../../i18n/I18nProvider';

export interface LoadedProps<T> {
  readonly resource: Resource<T>;
  readonly children: (data: T) => ReactNode;
  readonly skeleton?: ReactNode;
}

/** Render loading skeletons, a retry state, or the data. */
export function Loaded<T>({ resource, children, skeleton }: LoadedProps<T>) {
  const { t } = useI18n();
  if (resource.data !== undefined) return <>{children(resource.data)}</>;
  if (resource.status === 'error') {
    return (
      <EmptyState
        icon="alert"
        title={t('common.loadFailed')}
        action={
          <Button variant="secondary" size="sm" icon="refresh" onClick={resource.reload}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  return <>{skeleton ?? <Skeleton lines={3} label={t('common.loading')} />}</>;
}
