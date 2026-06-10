import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';

export default class OrbitDBReplicatedStateRegistry {
  private readonly storesByNetworkId = new Map<
    string,
    OrbitDBReplicatedStateStores
  >();

  private getStore(
    stores: OrbitDBReplicatedStateStores,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): OrbitDBDatabase {
    return stores[storeName];
  }

  private async allDocuments(
    store: OrbitDBDatabase,
  ): Promise<Array<Record<string, unknown>>> {
    const entries = await store.all?.();

    return (entries || [])
      .map((entry) => entry.value)
      .filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
      );
  }

  private async allRecords(store: OrbitDBDatabase): Promise<
    Array<{
      key?: string;
      value: Record<string, unknown>;
    }>
  > {
    const entries = await store.all?.();

    return (entries || [])
      .filter(
        (
          entry,
        ): entry is {
          key?: string;
          value: Record<string, unknown>;
        } =>
          typeof entry.value === 'object' &&
          entry.value !== null &&
          !Array.isArray(entry.value),
      )
      .map((entry) => ({
        key: entry.key,
        value: entry.value,
      }));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private recordValue(
    entry: { value?: unknown } | unknown,
  ): Record<string, unknown> | undefined {
    if (this.isRecord(entry) && 'value' in entry) {
      return this.isRecord(entry.value) ? entry.value : undefined;
    }

    return this.isRecord(entry) ? entry : undefined;
  }

  private withoutUndefined(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.withoutUndefined(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [
          entryKey,
          this.withoutUndefined(entryValue),
        ]),
    );
  }

  private cleanDocument(
    document: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.withoutUndefined(document) as Record<string, unknown>;
  }

  public register(
    networkId: string,
    stores: OrbitDBReplicatedStateStores,
  ): void {
    this.storesByNetworkId.set(networkId, stores);
  }

  public clear(): void {
    this.storesByNetworkId.clear();
  }

  public async queryDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<Array<Record<string, unknown>>> {
    const documents: Array<Record<string, unknown>> = [];

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);
      const matches = store.query
        ? await store.query(matcher)
        : (await this.allDocuments(store)).filter(matcher);

      documents.push(...matches);
    }

    return documents;
  }

  public async putDocument(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
  ): Promise<void> {
    const cleanDocument = this.cleanDocument(document);

    for (const stores of this.storesByNetworkId.values()) {
      await this.getStore(stores, storeName).put?.(cleanDocument);
    }
  }

  public async findHead(
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    for (const stores of this.storesByNetworkId.values()) {
      const directRecord = this.recordValue(await stores.heads.get?.(key));

      if (directRecord) {
        return directRecord;
      }

      const fallbackRecord = (await this.allRecords(stores.heads)).find(
        (record) => record.key === key,
      );

      if (fallbackRecord) {
        return fallbackRecord.value;
      }
    }

    return undefined;
  }

  public async putHead(
    key: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const cleanValue = this.cleanDocument(value);

    for (const stores of this.storesByNetworkId.values()) {
      await stores.heads.put?.(key, cleanValue);
    }
  }
}
