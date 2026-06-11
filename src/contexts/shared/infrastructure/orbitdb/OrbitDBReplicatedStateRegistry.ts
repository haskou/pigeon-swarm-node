import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';
import ReplicatedStateNotReadyError from './ReplicatedStateNotReadyError';

export default class OrbitDBReplicatedStateRegistry {
  private readonly storesByNetworkId = new Map<
    string,
    OrbitDBReplicatedStateStores
  >();

  private readonly cachedHeads = new Map<string, Record<string, unknown>>();

  private assertReady(): void {
    if (this.storesByNetworkId.size === 0) {
      throw new ReplicatedStateNotReadyError();
    }
  }

  private getStore(
    stores: OrbitDBReplicatedStateStores,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): OrbitDBDatabase | undefined {
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

  private cacheHead(key: string, value: Record<string, unknown>): void {
    const current = this.cachedHeads.get(key);

    if (
      !current ||
      this.documentFreshness(current) <= this.documentFreshness(value)
    ) {
      this.cachedHeads.set(key, value);
    }
  }

  private cacheHeadUpdate(entry: { payload?: { value?: unknown } }): void {
    const payloadValue = entry.payload?.value;

    if (!this.isRecord(payloadValue)) {
      return;
    }

    const record = this.recordValue(payloadValue);
    const key =
      this.stringValue(payloadValue, 'key') ||
      this.stringValue(record || {}, 'id');

    if (!key || !record) {
      return;
    }

    this.cacheHead(key, record);
  }

  private async hydrateHeadCache(
    stores: OrbitDBReplicatedStateStores,
  ): Promise<void> {
    const records = await this.allRecords(stores.heads);

    for (const record of records) {
      if (!record.key) {
        continue;
      }

      this.cacheHead(record.key, record.value);
    }
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

  private documentFreshness(document: Record<string, unknown>): number {
    return Math.max(
      ...['deletedAt', 'receivedAt', 'updatedAt', 'createdAt']
        .map((attribute) => document[attribute])
        .filter((value): value is number => typeof value === 'number'),
      0,
    );
  }

  private deduplicateDocuments(
    documents: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const deduplicated = new Map<string, Record<string, unknown>>();
    const withoutId: Array<Record<string, unknown>> = [];

    for (const document of documents) {
      const id = this.stringValue(document, 'id');

      if (!id) {
        withoutId.push(document);

        continue;
      }

      const current = deduplicated.get(id);

      if (
        !current ||
        this.documentFreshness(current) <= this.documentFreshness(document)
      ) {
        deduplicated.set(id, document);
      }
    }

    return [...withoutId, ...deduplicated.values()];
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] {
    const value = document[attribute];

    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : [];
  }

  private relatedDocumentId(document: Record<string, unknown>):
    | {
        storeName: OrbitDBReplicatedDocumentStoreName;
        value: string;
      }
    | undefined {
    const communityId = this.stringValue(document, 'communityId');

    if (communityId) {
      return { storeName: 'communities', value: communityId };
    }

    const conversationId = this.stringValue(document, 'conversationId');

    if (conversationId) {
      return { storeName: 'conversations', value: conversationId };
    }

    const payload = document.payload;

    if (!this.isRecord(payload)) {
      return undefined;
    }

    return this.relatedDocumentId(payload);
  }

  private relatedIdentityId(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'identityId')
    );
  }

  private relatedDocumentMatches(
    related: {
      storeName: OrbitDBReplicatedDocumentStoreName;
      value: string;
    },
    candidate: Record<string, unknown>,
  ): boolean {
    if (related.storeName === 'identities') {
      return (
        this.stringValue(candidate, 'id') === related.value ||
        this.stringValue(candidate, 'identityId') === related.value
      );
    }

    return this.stringValue(candidate, 'id') === related.value;
  }

  private async networkIdsFromRelatedDocument(
    document: Record<string, unknown>,
  ): Promise<string[]> {
    const related = this.relatedDocumentId(document);

    if (!related) {
      const identityId = this.relatedIdentityId(document);

      if (!identityId) {
        return [];
      }

      const identityDocuments = await this.queryDocuments(
        'identities',
        (candidate) =>
          this.relatedDocumentMatches(
            { storeName: 'identities', value: identityId },
            candidate,
          ),
      );

      return [
        ...new Set(
          identityDocuments.flatMap((candidate) => [
            ...this.stringArrayValue(candidate, 'networkIds'),
            ...(this.stringValue(candidate, 'networkId')
              ? [this.stringValue(candidate, 'networkId') as string]
              : []),
          ]),
        ),
      ];
    }

    const relatedDocuments = await this.queryDocuments(
      related.storeName,
      (candidate) => this.relatedDocumentMatches(related, candidate),
    );

    return [
      ...new Set(
        relatedDocuments.flatMap((candidate) => [
          ...this.stringArrayValue(candidate, 'networkIds'),
          ...(this.stringValue(candidate, 'networkId')
            ? [this.stringValue(candidate, 'networkId') as string]
            : []),
        ]),
      ),
    ];
  }

  private async targetNetworkIdsForDocument(
    document: Record<string, unknown>,
    explicitNetworkIds: string[] = [],
  ): Promise<string[]> {
    const directNetworkIds = [
      ...new Set([
        ...explicitNetworkIds,
        ...this.stringArrayValue(document, 'networkIds'),
        ...(this.stringValue(document, 'networkId')
          ? [this.stringValue(document, 'networkId') as string]
          : []),
        ...(this.isRecord(document.payload)
          ? this.stringArrayValue(document.payload, 'networkIds')
          : []),
        ...(this.isRecord(document.payload) &&
        this.stringValue(document.payload, 'networkId')
          ? [this.stringValue(document.payload, 'networkId') as string]
          : []),
      ]),
    ];

    if (directNetworkIds.length > 0) {
      return directNetworkIds;
    }

    return [...new Set(await this.networkIdsFromRelatedDocument(document))];
  }

  private storesForNetworkIds(
    networkIds: string[],
  ): OrbitDBReplicatedStateStores[] {
    const stores = new Map<string, OrbitDBReplicatedStateStores>();

    for (const networkId of networkIds) {
      const networkStores = this.storesByNetworkId.get(networkId);

      if (networkStores) {
        stores.set(networkId, networkStores);
      }
    }

    if (stores.size > 0) {
      return [...stores.values()];
    }

    if (networkIds.length > 0) {
      return [];
    }

    return [...this.storesByNetworkId.values()];
  }

  public register(
    networkId: string,
    stores: OrbitDBReplicatedStateStores,
  ): void {
    this.storesByNetworkId.set(networkId, stores);
    stores.heads.events?.on?.('update', (entry) => this.cacheHeadUpdate(entry));
    this.hydrateHeadCache(stores).catch((error: unknown): void => {
      void error;
    });
  }

  public clear(): void {
    this.storesByNetworkId.clear();
    this.cachedHeads.clear();
  }

  public async queryDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<Array<Record<string, unknown>>> {
    this.assertReady();
    const documents: Array<Record<string, unknown>> = [];

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);

      if (!store) {
        continue;
      }
      const matches = store.query
        ? await store.query(matcher)
        : (await this.allDocuments(store)).filter(matcher);

      documents.push(...matches);
    }

    return this.deduplicateDocuments(documents);
  }

  public async putDocument(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    this.assertReady();
    const cleanDocument = this.cleanDocument(document);
    const targetNetworkIds = await this.targetNetworkIdsForDocument(
      cleanDocument,
      networkIds,
    );

    for (const stores of this.storesForNetworkIds(targetNetworkIds)) {
      await this.getStore(stores, storeName)?.put?.(cleanDocument);
    }
  }

  public async findHead(
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    this.assertReady();
    const cachedHead = this.cachedHeads.get(key);

    if (cachedHead) {
      return cachedHead;
    }

    for (const stores of this.storesByNetworkId.values()) {
      const directRecord = this.recordValue(await stores.heads.get?.(key));

      if (directRecord) {
        this.cacheHead(key, directRecord);

        return directRecord;
      }

      const fallbackRecord = (await this.allRecords(stores.heads)).find(
        (record) => record.key === key,
      );

      if (fallbackRecord) {
        this.cacheHead(key, fallbackRecord.value);

        return fallbackRecord.value;
      }
    }

    return undefined;
  }

  public async putHead(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);
    const targetNetworkIds = await this.targetNetworkIdsForDocument(
      cleanValue,
      networkIds,
    );

    for (const stores of this.storesForNetworkIds(targetNetworkIds)) {
      await stores.heads.put?.(key, cleanValue);
      this.cacheHead(key, cleanValue);
    }
  }
}
