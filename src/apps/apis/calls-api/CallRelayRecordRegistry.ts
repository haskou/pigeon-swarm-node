import { CallRelayRecordPrimitives } from './CallRelayRecordPrimitives';

export default class CallRelayRecordRegistry {
  private static readonly globalStateKey = '__pigeonSwarmCallRelayRecords';

  private get records(): Map<string, CallRelayRecordPrimitives> {
    const globalState = globalThis as typeof globalThis & {
      [CallRelayRecordRegistry.globalStateKey]?:
        Map<string, CallRelayRecordPrimitives> | undefined;
    };

    globalState[CallRelayRecordRegistry.globalStateKey] ??= new Map();

    return globalState[CallRelayRecordRegistry.globalStateKey];
  }

  public save(record: CallRelayRecordPrimitives): void {
    if (record.urls.length === 0) {
      return;
    }

    const existing = this.records.get(record.peerId);

    if (existing && existing.expiresAt > record.expiresAt) {
      return;
    }

    this.records.set(record.peerId, record);
  }

  public all(now: number = Date.now()): CallRelayRecordPrimitives[] {
    return [...this.records.values()].filter(
      (record) => record.expiresAt > now,
    );
  }

  public urlsForPeers(peerIds: string[], now: number = Date.now()): string[] {
    return [
      ...new Set(
        peerIds.flatMap((peerId) => {
          const record = this.records.get(peerId);

          return record && record.expiresAt > now ? record.urls : [];
        }),
      ),
    ];
  }

  public clear(): void {
    this.records.clear();
  }
}
