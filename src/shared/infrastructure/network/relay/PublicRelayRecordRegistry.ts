import fs from 'fs';
import path from 'path';

import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';
import { RelayRecordHandler } from './RelayRecordHandler';

export class PublicRelayRecordRegistry {
  private static readonly globalStateKey = '__pigeonSwarmPublicRelayRecords';

  private static readonly globalListenersKey =
    '__pigeonSwarmPublicRelayRecordListeners';

  private static readonly globalLoadedKey =
    '__pigeonSwarmPublicRelayRecordsLoaded';

  private static readonly defaultFallbackMs = 7 * 24 * 60 * 60 * 1000;

  private fallbackMs(): number {
    return Number(
      process.env.PIGEON_STORED_RELAY_FALLBACK_MS ||
        PublicRelayRecordRegistry.defaultFallbackMs,
    );
  }

  private storagePath(): string {
    return (
      process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH ||
      path.join(
        process.env.IPFS_STORAGE_PATH || './ipfs_storage',
        'publicRelayRecords.json',
      )
    );
  }

  private shouldPersist(): boolean {
    return (
      process.env.NODE_ENV !== 'test' ||
      Boolean(process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH)
    );
  }

  private get records(): Map<string, PublicRelayRecordPrimitives> {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRecordRegistry.globalStateKey]?:
        | Map<string, PublicRelayRecordPrimitives>
        | undefined;
    };

    globalState[PublicRelayRecordRegistry.globalStateKey] ??= new Map();

    return globalState[PublicRelayRecordRegistry.globalStateKey];
  }

  private get loaded(): boolean {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRecordRegistry.globalLoadedKey]?: boolean | undefined;
    };

    return Boolean(globalState[PublicRelayRecordRegistry.globalLoadedKey]);
  }

  private set loaded(value: boolean) {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRecordRegistry.globalLoadedKey]?: boolean | undefined;
    };

    globalState[PublicRelayRecordRegistry.globalLoadedKey] = value;
  }

  private get listeners(): RelayRecordHandler[] {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRecordRegistry.globalListenersKey]?:
        | RelayRecordHandler[]
        | undefined;
    };

    globalState[PublicRelayRecordRegistry.globalListenersKey] ??= [];

    return globalState[PublicRelayRecordRegistry.globalListenersKey];
  }

  private hasRecordStrings(
    value: Partial<PublicRelayRecordPrimitives>,
  ): boolean {
    return (
      typeof value.peerId === 'string' &&
      typeof value.publicKey === 'string' &&
      typeof value.signature === 'string'
    );
  }

  private hasRecordTimestamps(
    value: Partial<PublicRelayRecordPrimitives>,
  ): boolean {
    return (
      typeof value.issuedAt === 'number' && typeof value.expiresAt === 'number'
    );
  }

  private hasRecordMultiaddrs(
    value: Partial<PublicRelayRecordPrimitives>,
  ): boolean {
    return (
      Array.isArray(value.multiaddrs) &&
      value.multiaddrs.length > 0 &&
      value.multiaddrs.every((address) => typeof address === 'string')
    );
  }

  private isRecord(value: unknown): value is PublicRelayRecordPrimitives {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<PublicRelayRecordPrimitives>;

    return (
      candidate.version === 1 &&
      candidate.role === 'relay' &&
      this.hasRecordStrings(candidate) &&
      this.hasRecordTimestamps(candidate) &&
      this.hasRecordMultiaddrs(candidate)
    );
  }

  private sameMultiaddrs(
    left: PublicRelayRecordPrimitives,
    right: PublicRelayRecordPrimitives,
  ): boolean {
    return (
      [...left.multiaddrs].sort().join('\n') ===
      [...right.multiaddrs].sort().join('\n')
    );
  }

  private shouldNotify(
    existing: PublicRelayRecordPrimitives | undefined,
    next: PublicRelayRecordPrimitives,
    now: number,
  ): boolean {
    if (!existing) {
      return true;
    }

    return existing.expiresAt <= now || !this.sameMultiaddrs(existing, next);
  }

  private loadPersistedRecords(): void {
    if (this.loaded || !this.shouldPersist()) {
      this.loaded = true;

      return;
    }

    this.loaded = true;

    try {
      if (!fs.existsSync(this.storagePath())) {
        return;
      }

      const payload = JSON.parse(fs.readFileSync(this.storagePath(), 'utf8'));

      if (!Array.isArray(payload)) {
        return;
      }

      for (const record of payload.filter((value) => this.isRecord(value))) {
        this.records.set(record.peerId, record);
      }
    } catch {
      // A corrupt fallback cache must not break node startup.
    }
  }

  private persistRecords(): void {
    if (!this.shouldPersist()) {
      return;
    }

    try {
      fs.mkdirSync(path.dirname(this.storagePath()), { recursive: true });
      fs.writeFileSync(
        this.storagePath(),
        JSON.stringify([...this.records.values()], null, 2),
      );
    } catch {
      // Relay records are a fallback cache. Discovery can repopulate them.
    }
  }

  public save(record: PublicRelayRecordPrimitives): void {
    if (record.multiaddrs.length === 0) {
      return;
    }

    this.loadPersistedRecords();
    const now = Date.now();
    const existing = this.records.get(record.peerId);

    if (
      existing &&
      existing.expiresAt > record.expiresAt &&
      this.sameMultiaddrs(existing, record)
    ) {
      return;
    }

    const notifyListeners = this.shouldNotify(existing, record, now);

    this.records.set(record.peerId, record);
    this.persistRecords();

    if (notifyListeners) {
      this.listeners.forEach((listener): void => {
        listener(record).catch((): undefined => undefined);
      });
    }
  }

  public all(now: number = Date.now()): PublicRelayRecordPrimitives[] {
    this.loadPersistedRecords();

    return [...this.records.values()].filter(
      (record) => record.expiresAt > now,
    );
  }

  public allExceptPeer(
    peerId: string | undefined,
    now: number = Date.now(),
  ): PublicRelayRecordPrimitives[] {
    return this.all(now).filter((record) => record.peerId !== peerId);
  }

  public fallbackAll(now: number = Date.now()): PublicRelayRecordPrimitives[] {
    this.loadPersistedRecords();

    return [...this.records.values()].filter(
      (record) => record.expiresAt + this.fallbackMs() > now,
    );
  }

  public fallbackAllExceptPeer(
    peerId: string | undefined,
    now: number = Date.now(),
  ): PublicRelayRecordPrimitives[] {
    return this.fallbackAll(now).filter((record) => record.peerId !== peerId);
  }

  public multiaddrs(now: number = Date.now()): string[] {
    return this.all(now).flatMap((record) => record.multiaddrs);
  }

  public multiaddrsExceptPeer(
    peerId: string | undefined,
    now: number = Date.now(),
  ): string[] {
    return this.allExceptPeer(peerId, now).flatMap(
      (record) => record.multiaddrs,
    );
  }

  public fallbackMultiaddrs(now: number = Date.now()): string[] {
    return this.fallbackAll(now).flatMap((record) => record.multiaddrs);
  }

  public fallbackMultiaddrsExceptPeer(
    peerId: string | undefined,
    now: number = Date.now(),
  ): string[] {
    return this.fallbackAllExceptPeer(peerId, now).flatMap(
      (record) => record.multiaddrs,
    );
  }

  public pruneExpired(now: number = Date.now()): void {
    this.loadPersistedRecords();

    for (const record of this.records.values()) {
      if (record.expiresAt <= now) {
        this.records.delete(record.peerId);
      }
    }

    this.persistRecords();
  }

  public clear(): void {
    this.loadPersistedRecords();
    this.records.clear();
    this.persistRecords();
  }

  public onRecordSaved(listener: RelayRecordHandler): void {
    this.loadPersistedRecords();
    this.listeners.push(listener);
    this.all().forEach((record) => {
      listener(record).catch((): undefined => undefined);
    });
  }
}
