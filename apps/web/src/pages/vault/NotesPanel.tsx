import { useState } from 'react';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { PrivacyMeter } from '../../components/PrivacyMeter/PrivacyMeter';
import { Segmented } from '../../components/Segmented/Segmented';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Note } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import { noteTone } from '../shared/status';
import styles from '../page.module.css';
import local from './Vault.module.css';

type Filter = 'all' | 'spendable' | 'review' | 'closed';

const matches = (note: Note, filter: Filter): boolean => {
  if (filter === 'spendable') return note.status === 'approved';
  if (filter === 'review') return note.status === 'in_review' || note.status === 'declined';
  if (filter === 'closed') return note.status === 'spent' || note.status === 'exited';
  return true;
};

export function NotesPanel() {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [exiting, setExiting] = useState<Note | null>(null);
  const notes = useResource((source) => source.listNotes(), ['notes']);
  const exit = useAction(ds.exitPublicly.bind(ds));

  const confirmExit = async (): Promise<void> => {
    if (!exiting) return;
    const result = await exit.run(exiting.id);
    setExiting(null);
    if (result) show({ tone: 'warn', title: t('notes.exitDone') });
  };

  return (
    <Card>
      <div className={styles.stack}>
        <Segmented
          legend={t('notes.filter')}
          hideLegend
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('notes.filters.all') },
            { value: 'spendable', label: t('notes.filters.spendable') },
            { value: 'review', label: t('notes.filters.review') },
            { value: 'closed', label: t('notes.filters.closed') },
          ]}
        />
        <Loaded resource={notes}>
          {(items) => {
            const visible = items.filter((note) => matches(note, filter));
            if (visible.length === 0) return <EmptyState icon="vault" illo="vault" title={t('notes.emptyTitle')} body={t('notes.emptyBody')} />;
            return (
              <ul className={styles.list}>
                {visible.map((note) => (
                  <li key={note.id} className={[styles.row, local.noteRow].join(' ')}>
                    <div className={local.noteAmount}>
                      <span className={local.noteFigure}>{formatAmount(note.amount)}</span>
                      <span className={styles.rowSub}>{note.asset}</span>
                    </div>
                    <div className={[styles.rowMain, local.noteMain].join(' ')}>
                      <div className={local.noteMeta}>
                        <Badge tone={noteTone[note.status]}>{t(`notes.status.${note.status}`)}</Badge>
                        <span className={styles.rowSub}>
                          {t('notes.index', { n: note.index })} · {f.date(note.createdAt)}
                          {note.spentIn ? ` · ${t(`notes.spentIn.${note.spentIn}`)}` : ''}
                        </span>
                      </div>
                      {note.status === 'approved' || note.status === 'in_review' ? <PrivacyMeter mixedWith={note.mixedWith} pending={note.status === 'in_review'} /> : null}
                      {note.status === 'declined' ? <p className={styles.rowSub}>{t('notes.declinedHint')}</p> : null}
                    </div>
                    <div className={local.noteActions}>
                      <AddressDisplay value={note.depositTx} kind="tx" label={t('notes.depositTx')} />
                      {note.status === 'approved' || note.status === 'declined' ? (
                        <Button size="sm" variant="ghost" onClick={() => setExiting(note)}>
                          {t('notes.exit')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            );
          }}
        </Loaded>
      </div>
      <PublicActionDialog
        open={exiting !== null}
        title={t('notes.exitTitle')}
        description={t('notes.exitBody', { amount: exiting ? formatAmount(exiting.amount) : '', asset: exiting?.asset ?? '' })}
        reveals={[t('notes.exitReveal1'), t('notes.exitReveal2')]}
        confirmLabel={t('notes.exitConfirm')}
        busy={exit.busy}
        onClose={() => setExiting(null)}
        onConfirm={confirmExit}
      />
    </Card>
  );
}
