import { loadDeployments, type Deployments, type FetchLike } from '@hushcross/core';
import { useEffect, useState } from 'react';
import { Coin } from '../../components/Coin/Coin';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { Icon } from '../../components/Icon/Icon';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { appConfig, type AppConfig } from '../../config';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import { BSCSCAN_ADDRESS, CONTRACT_ROWS } from './docsContent';
import styles from './Docs.module.css';

export type LoadContracts = () => Promise<Deployments | null>;

const docsFetch: FetchLike = (url, init) =>
  fetch(url, { method: init?.method ?? 'GET', ...(init?.headers ? { headers: init.headers } : {}), credentials: 'omit', referrerPolicy: 'no-referrer' });

/** Same deployments file the app reads (VITE_DEPLOYMENTS_URL or VITE_DEPLOYMENTS_JSON); null when neither is set. */
export function loadConfiguredDeployments(config: Pick<AppConfig, 'deploymentsUrl' | 'deploymentsJson' | 'chainId'> = appConfig): Promise<Deployments | null> {
  if (config.deploymentsUrl) return loadDeployments({ url: config.deploymentsUrl, fetch: docsFetch, expectedChainId: config.chainId });
  if (config.deploymentsJson) return loadDeployments({ json: config.deploymentsJson, expectedChainId: config.chainId });
  return Promise.resolve(null);
}

type State = { readonly status: 'loading' } | { readonly status: 'ready'; readonly deployments: Deployments } | { readonly status: 'unavailable' };

function useContracts(load: LoadContracts): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    load().then(
      (deployments) => {
        if (live) setState(deployments ? { status: 'ready', deployments } : { status: 'unavailable' });
      },
      () => {
        if (live) setState({ status: 'unavailable' });
      },
    );
    return () => {
      live = false;
    };
  }, [load]);
  return state;
}

export function DocsContracts({ load, githubUrl }: { readonly load: LoadContracts; readonly githubUrl: string }) {
  const { t } = useI18n();
  const state = useContracts(load);
  const key = (id: string, leaf: 'name' | 'role'): MessageKey => `docs.sections.contracts.names.${id}.${leaf}` as MessageKey;

  if (state.status === 'loading') {
    return (
      <div className={styles.ledgerCard} aria-busy="true">
        <p className={styles.quiet}>{t('docs.sections.contracts.loading')}</p>
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div className={[styles.ledgerCard, styles.fallback].join(' ')} role="status">
        <Icon name="info" size={18} />
        <p>
          {t('docs.sections.contracts.unavailable')}{' '}
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            {t('social.github')}
          </a>
        </p>
      </div>
    );
  }

  const { deployments } = state;
  // Explorer links only make sense for BSC mainnet; a local deployment shows addresses without them.
  const onMainnet = deployments.chainId === 56;
  return (
    <ul className={[styles.ledgerCard, styles.contracts].join(' ')} aria-label={t('docs.sections.contracts.title')}>
      {CONTRACT_ROWS.map((row) => {
        const address = row.address(deployments);
        const name = t(key(row.id, 'name'));
        return (
          <li key={row.id} className={styles.contract} data-contract={row.id}>
            <Coin icon={row.icon} tone={row.tone} size="sm" />
            <span className={styles.contractName}>
              <span className={styles.contractTitle}>{name}</span>
              <span className={styles.contractRole}>{t(key(row.id, 'role'))}</span>
            </span>
            {address ? (
              <>
                <code className={styles.address}>{address}</code>
                <span className={styles.contractActions}>
                  <CopyButton value={address} variant="ghost" />
                  {onMainnet ? (
                    <a className={styles.scan} href={`${BSCSCAN_ADDRESS}${address}`} target="_blank" rel="noopener noreferrer" aria-label={t('docs.sections.contracts.viewOn', { name })}>
                      {t('docs.sections.contracts.bscscan')}
                      <Icon name="external" size={14} />
                    </a>
                  ) : null}
                </span>
              </>
            ) : (
              <span className={[styles.address, styles.quiet].join(' ')}>{t('docs.sections.contracts.notDeployed')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
