import { OrbitDBEntry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBEntry';

/**
 * An OrbitDB document store a restarted node reopens: its oplog still holds
 * what the node stored before, so the node replays that history on start.
 * `hearFromPeer` plays a peer's head update announcing that same head.
 */
export class ReopenedOrbitDBStore {
  private readonly documents = new Map<string, Record<string, unknown>>();
  private readonly entries = new Map<string, OrbitDBEntry>();
  private readonly updateHandlers: Array<(entry: OrbitDBEntry) => void> = [];
  private head?: OrbitDBEntry;

  public readonly all = jest.fn(() =>
    Promise.resolve(
      [...this.documents].map(([key, value]) => ({ key, value })),
    ),
  );

  public readonly events = {
    on: jest.fn((event: string, handler: (entry: OrbitDBEntry) => void) => {
      if (event === 'update') this.updateHandlers.push(handler);
    }),
  };

  public readonly get = jest.fn((key: string) =>
    Promise.resolve(this.documents.get(key)),
  );

  public readonly log = {
    get: jest.fn((hash: string) => Promise.resolve(this.entries.get(hash))),
    heads: jest.fn(() => Promise.resolve(this.head ? [this.head] : [])),
  };

  public readonly put = jest.fn((document: Record<string, unknown>) => {
    this.announce(this.append(document));

    return Promise.resolve(String(document.id));
  });

  constructor(documents: Record<string, unknown>[] = []) {
    for (const document of documents) this.append(document);
  }

  private append(document: Record<string, unknown>): OrbitDBEntry {
    const key = String(document.id);
    const entry: OrbitDBEntry = {
      hash: `entry-${this.entries.size + 1}`,
      next: this.head?.hash ? [this.head.hash] : [],
      payload: { key, value: document },
    };

    this.documents.set(key, document);
    this.entries.set(entry.hash!, entry);
    this.head = entry;

    return entry;
  }

  private announce(entry: OrbitDBEntry): void {
    for (const handler of this.updateHandlers) handler(entry);
  }

  public hearFromPeer(): void {
    if (this.head) this.announce(this.head);
  }
}
