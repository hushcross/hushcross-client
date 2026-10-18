import { SALE_DESCRIPTION_MAX, SALE_LOGO_MAX_BYTES, SALE_LOGO_MAX_SIDE, SALE_LOGO_MIN_SIDE, cleanSaleDescription, cleanSaleWebsite, cleanTelegramHandle, cleanXHandle, sniffSaleLogo } from '@hushcross/core';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Icon } from '../../components/Icon/Icon';
import { Input, TextArea } from '../../components/Input/Input';
import { SaleLogo } from '../../components/SaleLogo/SaleLogo';
import { useDataSource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import type { Sale, SaleLogoInput, SaleProfile, SaleProfileStage } from '../../data/types';
import type { MessageKey } from '../../i18n/types';
import { useI18n } from '../../i18n/I18nProvider';
import styles from '../page.module.css';
import local from './SaleProfile.module.css';

type ImageIssue = 'image_type' | 'image_too_large' | 'image_too_small' | 'image_dimensions' | 'image_invalid';
const SERVICE_CODES = new Set(['description_too_long', 'description_invalid', 'website_invalid', 'x_invalid', 'telegram_invalid', 'image_type', 'image_too_large', 'image_too_small', 'image_dimensions', 'image_invalid']);

type LogoState = { readonly kind: 'keep' } | { readonly kind: 'none' } | { readonly kind: 'replace'; readonly bytes: Uint8Array; readonly preview: string };

/** Size check in the browser when it can decode; the profile host decodes and re-encodes anyway. */
async function imageSize(bytes: Uint8Array, type: string): Promise<{ readonly width: number; readonly height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type }));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** File bytes; FileReader where `Blob.arrayBuffer` is missing (older browsers, jsdom). */
function readBytes(file: Blob | { readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file as Blob);
  });
}

export async function checkLogoFile(file: Blob | { readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<{ readonly ok: true; readonly bytes: Uint8Array; readonly type: string } | { readonly ok: false; readonly code: ImageIssue }> {
  if (file.size > SALE_LOGO_MAX_BYTES) return { ok: false, code: 'image_too_large' };
  const bytes = await readBytes(file);
  const kind = sniffSaleLogo(bytes);
  if (kind === null) return { ok: false, code: 'image_type' };
  const type = `image/${kind}`;
  const size = await imageSize(bytes, type);
  if (size !== null) {
    if (size.width < SALE_LOGO_MIN_SIDE || size.height < SALE_LOGO_MIN_SIDE) return { ok: false, code: 'image_too_small' };
    if (size.width > SALE_LOGO_MAX_SIDE || size.height > SALE_LOGO_MAX_SIDE) return { ok: false, code: 'image_dimensions' };
  }
  return { ok: true, bytes, type };
}

function previewUrl(bytes: Uint8Array, type: string): string {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([bytes.slice()], { type })) : '';
}

export interface SaleProfileFormProps {
  readonly sale: Sale;
  readonly current: SaleProfile | null;
  readonly onDone?: (profile: SaleProfile) => void;
  readonly onCancel?: () => void;
  readonly cancelLabel?: string;
  /** Pre-fill for a new profile (e.g. the description typed while creating the sale). */
  readonly initialDescription?: string;
}

/**
 * Creator form: logo (with preview and crop guidance), description, website, X, Telegram. The creator's
 * public wallet signs the upload and sends `setProfile`; the status line follows each stage.
 */
export function SaleProfileForm({ sale, current, onDone, onCancel, cancelLabel, initialDescription }: SaleProfileFormProps) {
  const { t } = useI18n();
  const ds = useDataSource();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(current?.description ?? (initialDescription || sale.description));
  const [website, setWebsite] = useState(current?.website ?? '');
  const [x, setX] = useState(current?.x ?? '');
  const [telegram, setTelegram] = useState(current?.telegram ?? '');
  const [logo, setLogo] = useState<LogoState>(current?.logoUrl ? { kind: 'keep' } : { kind: 'none' });
  const [logoError, setLogoError] = useState<ImageIssue | null>(null);
  const [checking, setChecking] = useState(false);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<SaleProfileStage | 'done' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => () => {
    if (logo.kind === 'replace' && logo.preview.startsWith('blob:')) URL.revokeObjectURL(logo.preview);
  }, [logo]);

  const descriptionCheck = cleanSaleDescription(description);
  const websiteCheck = cleanSaleWebsite(website);
  const xCheck = cleanXHandle(x);
  const telegramCheck = cleanTelegramHandle(telegram);
  const issue = (check: { readonly ok: boolean; readonly code?: string }): string | undefined => (touched && !check.ok && check.code ? t(`saleProfile.errors.${check.code}` as MessageKey, { max: SALE_DESCRIPTION_MAX }) : undefined);
  const valid = descriptionCheck.ok && websiteCheck.ok && xCheck.ok && telegramCheck.ok && logoError === null && !checking;
  const busy = stage !== null && stage !== 'done';

  const pick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setChecking(true);
    setLogoError(null);
    try {
      const checked = await checkLogoFile(file);
      if (!checked.ok) {
        setLogoError(checked.code);
        return;
      }
      setLogo({ kind: 'replace', bytes: checked.bytes, preview: previewUrl(checked.bytes, checked.type) });
    } finally {
      setChecking(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const submit = async (): Promise<void> => {
    setTouched(true);
    setFailure(null);
    if (!valid) return;
    const logoInput: SaleLogoInput = logo.kind === 'replace' ? { kind: 'replace', bytes: logo.bytes } : logo;
    try {
      const saved = await ds.saveSaleProfile({ sale, fields: { description, website, x, telegram }, logo: logoInput, onStage: setStage });
      setStage('done');
      onDone?.(saved);
    } catch (error: unknown) {
      setStage(null);
      const code = isDataSourceError(error) ? error.code : 'network';
      const detail = isDataSourceError(error) ? error.message : '';
      setFailure(code === 'invalid_input' && SERVICE_CODES.has(detail) ? t(`saleProfile.errors.${detail}` as MessageKey, { max: SALE_DESCRIPTION_MAX }) : t(`errors.${code}`));
    }
  };

  const shown = logo.kind === 'replace' ? logo.preview || null : logo.kind === 'keep' ? (current?.logoUrl ?? null) : null;

  return (
    <form
      className={styles.form}
      aria-label={t('saleProfile.title')}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className={styles.note}>{t('saleProfile.intro')}</p>
      <div className={local.logoRow}>
        <div className={local.preview} aria-label={t('saleProfile.logoPreview')} role="group">
          <SaleLogo symbol={sale.tokenSymbol} src={shown} size="xl" />
          <span className={local.cropGuide} aria-hidden="true" />
        </div>
        <div className={local.logoControls}>
          <label className={local.logoLabel} htmlFor={fileId}>
            {t('saleProfile.logo')}
          </label>
          <input ref={fileInput} id={fileId} className={local.fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files?.[0])} disabled={busy} />
          <div className={local.logoButtons}>
            <Button type="button" size="sm" variant="secondary" icon="plus" onClick={() => fileInput.current?.click()} disabled={busy} loading={checking}>
              {logo.kind === 'none' ? t('saleProfile.logoChoose') : t('saleProfile.logoReplace')}
            </Button>
            {logo.kind !== 'none' ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLogo({ kind: 'none' })} disabled={busy}>
                {t('saleProfile.logoRemove')}
              </Button>
            ) : null}
            {logo.kind !== 'keep' && current?.logoUrl ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLogo({ kind: 'keep' })} disabled={busy}>
                {t('saleProfile.logoKeep')}
              </Button>
            ) : null}
          </div>
          {logoError ? (
            <p className={local.error} role="alert">
              {t(`saleProfile.errors.${logoError}`)}
            </p>
          ) : (
            <p className={local.hint}>
              {checking ? t('saleProfile.logoChecking') : t('saleProfile.logoHint')} {t('saleProfile.logoCropGuide')}
            </p>
          )}
        </div>
      </div>
      <TextArea label={t('saleProfile.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={SALE_DESCRIPTION_MAX * 2} rows={4} hint={t('saleProfile.descriptionHint', { max: SALE_DESCRIPTION_MAX })} error={issue(descriptionCheck)} disabled={busy} />
      <Input label={t('saleProfile.website')} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" inputMode="url" autoCapitalize="none" spellCheck={false} hint={t('saleProfile.websiteHint')} error={issue(websiteCheck)} disabled={busy} />
      <div className={styles.formRow}>
        <Input label={t('saleProfile.x')} value={x} onChange={(e) => setX(e.target.value)} placeholder="@" autoCapitalize="none" spellCheck={false} hint={t('saleProfile.xHint')} error={issue(xCheck)} disabled={busy} />
        <Input label={t('saleProfile.telegram')} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@" autoCapitalize="none" spellCheck={false} hint={t('saleProfile.telegramHint')} error={issue(telegramCheck)} disabled={busy} />
      </div>
      <p className={[styles.callout].join(' ')}>
        <Icon name="wallet" />
        <span>{t('saleProfile.publicNote')}</span>
      </p>
      <p className={local.status} role="status" aria-live="polite">
        {stage === null ? '' : t(`saleProfile.status.${stage}`)}
      </p>
      {failure ? (
        <p className={local.error} role="alert">
          {failure}
        </p>
      ) : null}
      <div className={local.actions}>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t('saleProfile.cancel')}
          </Button>
        ) : null}
        <Button type="submit" icon="check" loading={busy} disabled={checking}>
          {t('saleProfile.save')}
        </Button>
      </div>
    </form>
  );
}
