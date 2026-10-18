import { ServiceError, type RelayTaskView } from '@hushcross/core';
import { DataSourceError } from '../data/DataSource';

/** Run a relay-paid task request; `null` when this relay does not offer it (404 / `not_enabled`). */
export async function relayTask(request: () => Promise<RelayTaskView>): Promise<RelayTaskView | null> {
  try {
    return await request();
  } catch (error: unknown) {
    if (error instanceof ServiceError && (error.status === 404 || error.code === 'not_enabled')) return null;
    if (error instanceof ServiceError) throw new DataSourceError('relay_rejected', error.message);
    throw error;
  }
}
