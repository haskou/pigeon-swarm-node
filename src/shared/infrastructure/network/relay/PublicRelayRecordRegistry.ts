import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export class PublicRelayRecordRegistry {
  private static readonly globalStateKey = '__pigeonSwarmPublicRelayRecords';

  private get records(): Map<string, PublicRelayRecordPrimitives> {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRecordRegistry.globalStateKey]?:
        | Map<string, PublicRelayRecordPrimitives>
        | undefined;
    };

    globalState[PublicRelayRecordRegistry.globalStateKey] ??= new Map();

    return globalState[PublicRelayRecordRegistry.globalStateKey];
  }

  public save(record: PublicRelayRecordPrimitives): void {
    this.records.set(record.peerId, record);
  }

  public all(now: number = Date.now()): PublicRelayRecordPrimitives[] {
    return [...this.records.values()].filter(
      (record) => record.expiresAt > now,
    );
  }

  public multiaddrs(now: number = Date.now()): string[] {
    return this.all(now).flatMap((record) => record.multiaddrs);
  }

  public pruneExpired(now: number = Date.now()): void {
    for (const record of this.records.values()) {
      if (record.expiresAt <= now) {
        this.records.delete(record.peerId);
      }
    }
  }

  public clear(): void {
    this.records.clear();
  }
}
