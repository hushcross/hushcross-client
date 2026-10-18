/** Incremental log sync (from the deployment start block to the head), shared by the Book and Give reads. */
export class LogSync<T> {
  private logs: T[] = [];
  private syncedTo: bigint;
  private inflight: Promise<readonly T[]> | null = null;

  constructor(
    private readonly head: () => Promise<bigint>,
    private readonly load: (from: bigint, to: bigint) => Promise<readonly T[]>,
    startBlock: bigint,
  ) {
    this.syncedTo = startBlock - 1n;
  }

  sync(): Promise<readonly T[]> {
    this.inflight ??= this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async run(): Promise<readonly T[]> {
    const head = await this.head();
    if (head > this.syncedTo) {
      const fresh = await this.load(this.syncedTo + 1n, head);
      this.logs = [...this.logs, ...fresh];
      this.syncedTo = head;
    }
    return this.logs;
  }
}

/** One sync per (owner, key): data sources keep theirs for the lifetime of the context. */
export function syncFor<T>(cache: WeakMap<object, Map<string, LogSync<unknown>>>, owner: object, key: string, create: () => LogSync<T>): LogSync<T> {
  let map = cache.get(owner);
  if (!map) {
    map = new Map();
    cache.set(owner, map);
  }
  const hit = map.get(key) as LogSync<T> | undefined;
  if (hit) return hit;
  const made = create();
  map.set(key, made as LogSync<unknown>);
  return made;
}
