import { useCallback, useState } from 'react';
import { useToast } from '../components/Toast/Toast';
import { isDataSourceError } from '../data/DataSource';
import { useI18n } from '../i18n/I18nProvider';

/** Run a write, track its busy state, and turn DataSourceErrors into toasts. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>): { readonly run: (...args: A) => Promise<R | null>; readonly busy: boolean } {
  const [busy, setBusy] = useState(false);
  const { show } = useToast();
  const { t } = useI18n();
  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      setBusy(true);
      try {
        return await action(...args);
      } catch (error: unknown) {
        const code = isDataSourceError(error) ? error.code : 'network';
        show({ tone: 'danger', title: t(`errors.${code}`) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [action, show, t],
  );
  return { run, busy };
}
