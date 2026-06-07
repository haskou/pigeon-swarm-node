import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';
import { RelayRecordHandler } from './RelayRecordHandler';

export class PublicRelayRecordRegistry {
  private static readonly globalStateKey = '__pigeonSwarmPublicRelayRecords';
  private static readonly globalListenersKey =
    '__pigeonSwarmPublicRelayRecordListeners';

  private get records(): Map<string, PublicRelayRecordPrimitives> {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRecordRegistry.globalStateKey]?:
        | Map<string, PublicRelayRecordPrimitives>
        | undefined;
    };

    globalState[PublicRelayRecordRegistry.globalStateKey] ??= new Map();

    return globalState[PublicRelayRecordRegistry.globalStateKey];
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

  public save(record: PublicRelayRecordPrimitives): void {
    this.records.set(record.peerId, record);
    this.listeners.forEach((listener): void => {
      listener(record).catch((): undefined => undefined);
    });
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

  public onRecordSaved(listener: RelayRecordHandler): void {
    this.listeners.push(listener);
  }
}
