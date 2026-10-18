import { ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { useI18n } from '../i18n/I18nProvider';

export function NotFoundPage() {
  const { t } = useI18n();
  return <EmptyState art="lost" title={t('notFound.title')} body={t('notFound.body')} action={<ButtonLink to="/">{t('notFound.home')}</ButtonLink>} />;
}
