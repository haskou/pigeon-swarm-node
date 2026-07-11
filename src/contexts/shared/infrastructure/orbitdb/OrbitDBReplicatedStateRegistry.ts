import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import Kernel from '@haskou/ddd-kernel';

import LocalOrbitDBReplicatedHeadCache from './LocalOrbitDBReplicatedHeadCache';
import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBPrivateNetworkStores } from './OrbitDBPrivateNetworkStores';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import OrbitDBReplicatedHeadCache from './OrbitDBReplicatedHeadCache';
import OrbitDBReplicatedHeadKeyDeriver from './OrbitDBReplicatedHeadKeyDeriver';
import ReplicatedStateNotReadyError from './ReplicatedStateNotReadyError';

type PersistedHeadCacheHydration = {
  heads: number;
  warm: boolean;
};

export default class OrbitDBReplicatedStateRegistry {
  // TODO: Move indexed head merge policy to OrbitDBHeadIndex before adding
  // per-index record identity or freshness rules here.
  private static readonly INDEX_HEAD_COLLECTION_NAMES = new Set([
    'calls',
    'conversations',
    'messages',
    'pins',
    'reactions',
    'summaries',
  ]);

  private readonly storesByNetworkId = new Map<
    string,
    OrbitDBPrivateNetworkStores
  >();

  private readonly cachedHeads = new Map<string, Record<string, unknown>>();

  private headCache?: OrbitDBReplicatedHeadCache;

  private readonly headKeyDeriver = new OrbitDBReplicatedHeadKeyDeriver();

  private static defaultHeadCache(): OrbitDBReplicatedHeadCache | undefined {
    if (process.env.JEST_WORKER_ID || pigeonEnvironment().NODE_ENV === 'test') {
      return undefined;
    }

    return new LocalOrbitDBReplicatedHeadCache(new EmbeddedLocalDatabase());
  }

  public static withHeadCache(
    headCache: OrbitDBReplicatedHeadCache,
  ): OrbitDBReplicatedStateRegistry {
    const registry = new OrbitDBReplicatedStateRegistry();
    registry.headCache = headCache;

    return registry;
  }

  constructor() {
    this.headCache = OrbitDBReplicatedStateRegistry.defaultHeadCache();
  }

  private assertReady(): void {
    if (this.storesByNetworkId.size === 0) {
      throw new ReplicatedStateNotReadyError();
    }
  }

  private getStore(
    stores: OrbitDBPrivateNetworkStores,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): OrbitDBDatabase | undefined {
    return stores[storeName];
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

  private headRecordCollectionNames(
    document: Record<string, unknown>,
  ): string[] {
    return Object.entries(document)
      .filter(
        ([key, value]) =>
          OrbitDBReplicatedStateRegistry.INDEX_HEAD_COLLECTION_NAMES.has(key) &&
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((item) => this.isRecord(item)),
      )
      .map(([key]) => key);
  }

  private sharedHeadRecordCollectionName(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): string | undefined {
    const currentNames = new Set(this.headRecordCollectionNames(current));
    const candidateNames = this.headRecordCollectionNames(candidate).filter(
      (name) => currentNames.has(name),
    );

    return candidateNames.length === 1 ? candidateNames[0] : undefined;
  }

  private recordId(record: Record<string, unknown>): string | undefined {
    return (
      this.stringValue(record, 'id') ||
      this.stringValue(record, 'messageId') ||
      this.stringValue(record, 'rootMessageId')
    );
  }

  private mergeHeadRecords(
    currentRecords: Record<string, unknown>[],
    candidateRecords: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const merged = new Map<string, Record<string, unknown>>();
    const withoutId: Record<string, unknown>[] = [];

    for (const record of [...currentRecords, ...candidateRecords]) {
      const id = this.recordId(record);

      if (!id) {
        withoutId.push(record);

        continue;
      }

      const current = merged.get(id);

      if (!current || this.isNewerOrEqualDocument(current, record)) {
        merged.set(id, record);
      }
    }

    return [...withoutId, ...merged.values()];
  }

  private mergeHeadRecordCollection(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    const collectionName = this.sharedHeadRecordCollectionName(
      current,
      candidate,
    );

    if (!collectionName) {
      return candidate;
    }

    const currentRecords = current[collectionName] as Record<string, unknown>[];
    const candidateRecords = candidate[collectionName] as Record<
      string,
      unknown
    >[];

    return {
      ...candidate,
      [collectionName]: this.mergeHeadRecords(currentRecords, candidateRecords),
      updatedAt: Math.max(
        this.documentFreshness(current),
        this.documentFreshness(candidate),
      ),
    };
  }

  private cacheHead(
    key: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const current = this.cachedHeads.get(key);
    const candidate = current
      ? this.mergeHeadRecordCollection(current, value)
      : value;
    const accepted =
      !current || this.isNewerOrEqualDocument(current, candidate);

    if (accepted) {
      this.cachedHeads.set(key, candidate);

      return candidate;
    }

    return undefined;
  }

  private cacheHeadUpdate(
    networkId: string,
    entry: { payload?: { value?: unknown } },
  ): void {
    const payloadValue = entry.payload?.value;

    if (!this.isRecord(payloadValue)) {
      return;
    }

    const record = this.recordValue(payloadValue);
    const explicitKey = this.stringValue(payloadValue, 'key');

    if (!record) {
      return;
    }

    const keys = explicitKey
      ? this.headKeyDeriver.cachedKeys(explicitKey, record)
      : this.headKeyDeriver.implicitKeys(record);

    for (const key of keys) {
      const cachedHead = this.cacheHead(key, record);

      if (cachedHead) {
        void this.persistHeadCache(networkId, key, cachedHead);
      }
    }
  }

  private async hydrateHeadCache(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
  ): Promise<number> {
    const records = await this.allRecords(stores.heads);
    let persistedAllHeads = true;

    for (const record of records) {
      if (!record.key) {
        continue;
      }

      const keys = this.headKeyDeriver.cachedKeys(record.key, record.value);

      for (const key of keys) {
        const cachedHead = this.cacheHead(key, record.value);

        if (cachedHead) {
          persistedAllHeads =
            (await this.persistHeadCache(networkId, key, cachedHead)) &&
            persistedAllHeads;
        }
      }
    }

    if (persistedAllHeads) {
      await this.markHeadCacheWarm(networkId);
    }

    return records.length;
  }

  private hydrateOrbitDBHeadCacheInBackground(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
  ): void {
    void this.hydrateHeadCache(networkId, stores)
      .then((heads) => {
        Kernel.logger.debug?.(
          `OrbitDB replicated head cache rebuilt: networkId=${networkId} heads=${heads}`,
        );
      })
      .catch((error) => {
        Kernel.logger.warn?.(
          `OrbitDB replicated head cache rebuild failed: networkId=${networkId} error=${String(error)}`,
        );
      });
  }

  private async hydratePersistedHeadCache(
    networkId: string,
  ): Promise<PersistedHeadCacheHydration> {
    if (!this.headCache) {
      return { heads: 0, warm: false };
    }

    try {
      const heads = await this.headCache.findByNetworkId(networkId);
      const warm = await this.headCache.isWarm(networkId);

      heads.forEach((head) => {
        for (const key of this.headKeyDeriver.cachedKeys(
          head.key,
          head.value,
        )) {
          this.cacheHead(key, head.value);
        }
      });

      if (heads.length > 0) {
        Kernel.logger.debug?.(
          `OrbitDB replicated head cache restored: networkId=${networkId} heads=${heads.length}`,
        );
      }

      return { heads: heads.length, warm };
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB replicated head cache restore failed: networkId=${networkId} error=${String(error)}`,
      );

      return { heads: 0, warm: false };
    }
  }

  private async persistHeadCache(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.headCache) {
      return true;
    }

    try {
      await this.headCache.save(networkId, key, this.cleanDocument(value));

      return true;
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB replicated head cache persistence failed: networkId=${networkId} key=${key} error=${String(error)}`,
      );

      return false;
    }
  }

  private async markHeadCacheWarm(networkId: string): Promise<void> {
    if (!this.headCache) {
      return;
    }

    try {
      await this.headCache.markWarm(networkId);
    } catch (error) {
      Kernel.logger.warn?.(
        `OrbitDB replicated head cache warm marker failed: networkId=${networkId} error=${String(error)}`,
      );
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
      ...[
        'deletedAt',
        'editedAt',
        'endedAt',
        'receivedAt',
        'updatedAt',
        'createdAt',
      ]
        .map((attribute) => document[attribute])
        .filter((value): value is number => typeof value === 'number'),
      0,
    );
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private documentVersion(document: Record<string, unknown>): number {
    return this.numberValue(document, 'version') || 0;
  }

  private canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalValue(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, this.canonicalValue(value[key])]),
    );
  }

  private headComparableValue(
    document: Record<string, unknown>,
  ): Record<string, unknown> {
    const value = { ...document };

    if (this.headRecordCollectionNames(value).length > 0) {
      delete value.updatedAt;
    }

    return value;
  }

  private isSameHeadContent(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const currentCollections = this.headRecordCollectionNames(current);
    const candidateCollections = this.headRecordCollectionNames(candidate);

    if (
      currentCollections.length === 0 ||
      currentCollections.length !== candidateCollections.length ||
      currentCollections.some(
        (collectionName) => !candidateCollections.includes(collectionName),
      )
    ) {
      return false;
    }

    return (
      JSON.stringify(this.canonicalValue(this.headComparableValue(current))) ===
      JSON.stringify(this.canonicalValue(this.headComparableValue(candidate)))
    );
  }

  private async isSameHeadContentPersisted(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[],
  ): Promise<boolean> {
    const entries = this.networkStoreEntriesForNetworkIds(networkIds);

    if (entries.length === 0) {
      return false;
    }

    try {
      const persistedHeads = await Promise.all(
        entries.map(async ({ stores }) =>
          this.recordValue(await stores.heads.get?.(key)),
        ),
      );

      return persistedHeads.every(
        (head) => head !== undefined && this.isSameHeadContent(head, value),
      );
    } catch {
      return false;
    }
  }

  private hasSameCachedHeadContent(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): boolean {
    return current !== undefined && this.isSameHeadContent(current, candidate);
  }

  private async shouldSkipHeadWrite(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[],
    force: boolean,
    hasSameCachedContent: boolean,
  ): Promise<boolean> {
    if (force || !hasSameCachedContent) {
      return false;
    }

    return this.isSameHeadContentPersisted(key, value, networkIds);
  }

  private async targetNetworkIdsForHeadWrite(
    value: Record<string, unknown>,
    networkIds: string[],
  ): Promise<string[]> {
    if (networkIds.length > 0) {
      return networkIds;
    }

    return this.targetNetworkIdsForDocument(value, networkIds);
  }

  private nextHeadWriteValue(
    key: string,
    value: Record<string, unknown>,
    current: Record<string, unknown> | undefined,
    hasSameCachedContent: boolean,
  ): Record<string, unknown> | undefined {
    return (
      this.cacheHead(key, value) ?? (hasSameCachedContent ? current : undefined)
    );
  }

  private isNewerOrEqualDocument(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const currentVersion = this.documentVersion(current);
    const candidateVersion = this.documentVersion(candidate);

    if (currentVersion !== candidateVersion) {
      return currentVersion < candidateVersion;
    }

    return this.documentFreshness(current) <= this.documentFreshness(candidate);
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

  private networkIdsFromDocument(document: Record<string, unknown>): string[] {
    return [
      ...new Set([
        ...this.stringArrayValue(document, 'networkIds'),
        ...(this.stringValue(document, 'networkId')
          ? [this.stringValue(document, 'networkId') as string]
          : []),
      ]),
    ];
  }

  private relatedHeadKey(related: {
    storeName: OrbitDBReplicatedDocumentStoreName;
    value: string;
  }): string | undefined {
    if (related.storeName === 'communities') {
      return `community:${related.value}`;
    }

    if (related.storeName === 'conversations') {
      return `conversation:${related.value}`;
    }

    if (related.storeName === 'identities') {
      return `identity:${related.value}`;
    }

    return undefined;
  }

  private async networkIdsFromRelatedHead(related: {
    storeName: OrbitDBReplicatedDocumentStoreName;
    value: string;
  }): Promise<string[]> {
    const headKey = this.relatedHeadKey(related);

    if (!headKey) {
      return [];
    }

    const head = await this.findHead(headKey);

    return head ? this.networkIdsFromDocument(head) : [];
  }

  private relatedIdentityIds(document: Record<string, unknown>): string[] {
    const identityIds = [
      this.stringValue(document, 'ownerIdentityId'),
      this.stringValue(document, 'identityId'),
      this.stringValue(document, 'recipientIdentityId'),
      this.stringValue(document, 'inviterIdentityId'),
    ];
    const payload = document.payload;

    if (this.isRecord(payload)) {
      identityIds.push(...this.relatedIdentityIds(payload));
    }

    return [
      ...new Set(
        identityIds.filter(
          (identityId): identityId is string => typeof identityId === 'string',
        ),
      ),
    ];
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

  private async networkIdsFromRelatedIdentityHead(
    document: Record<string, unknown>,
  ): Promise<string[]> {
    for (const identityId of this.relatedIdentityIds(document)) {
      const networkIds = await this.networkIdsFromRelatedHead({
        storeName: 'identities',
        value: identityId,
      });

      if (networkIds.length > 0) {
        return networkIds;
      }
    }

    return [];
  }

  private async networkIdsFromRelatedDocument(
    document: Record<string, unknown>,
  ): Promise<string[]> {
    const related = this.relatedDocumentId(document);

    if (!related) {
      return this.networkIdsFromRelatedIdentityHead(document);
    }

    const relatedNetworkIds = await this.networkIdsFromRelatedHead(related);

    return relatedNetworkIds.length > 0
      ? relatedNetworkIds
      : this.networkIdsFromRelatedIdentityHead(document);
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
  ): OrbitDBPrivateNetworkStores[] {
    return this.networkStoreEntriesForNetworkIds(networkIds).map(
      ({ stores }) => stores,
    );
  }

  private networkStoreEntriesForNetworkIds(
    networkIds: string[],
  ): Array<{ networkId: string; stores: OrbitDBPrivateNetworkStores }> {
    const stores = new Map<string, OrbitDBPrivateNetworkStores>();

    for (const networkId of networkIds) {
      const networkStores = this.storesByNetworkId.get(networkId);

      if (networkStores) {
        stores.set(networkId, networkStores);
      }
    }

    if (stores.size > 0) {
      return [...stores.entries()].map(([networkId, networkStores]) => ({
        networkId,
        stores: networkStores,
      }));
    }

    if (networkIds.length > 0) {
      return [];
    }

    return [...this.storesByNetworkId.entries()].map(
      ([networkId, networkStores]) => ({
        networkId,
        stores: networkStores,
      }),
    );
  }

  private async findStoredHead(
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    for (const stores of this.storesByNetworkId.values()) {
      const directRecord = this.recordValue(await stores.heads.get?.(key));

      if (directRecord) {
        const cachedHead = this.cacheHead(key, directRecord);

        return cachedHead ?? this.cachedHeads.get(key) ?? directRecord;
      }
    }

    return undefined;
  }

  public async register(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
  ): Promise<void> {
    this.storesByNetworkId.set(networkId, stores);
    stores.heads.events?.on?.('update', (entry) =>
      this.cacheHeadUpdate(networkId, entry),
    );

    const persistedHeadCache = this.headCache
      ? await this.hydratePersistedHeadCache(networkId)
      : { heads: 0, warm: false };

    if (persistedHeadCache.warm && persistedHeadCache.heads > 0) {
      this.hydrateOrbitDBHeadCacheInBackground(networkId, stores);

      return;
    }

    await this.hydrateHeadCache(networkId, stores);
  }

  public async unregister(networkId: string): Promise<void> {
    const stores = this.storesByNetworkId.get(networkId);

    this.storesByNetworkId.delete(networkId);
    this.cachedHeads.clear();

    await stores?.stop();
  }

  public clear(): void {
    this.storesByNetworkId.clear();
    this.cachedHeads.clear();
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

    await Promise.all(
      this.networkStoreEntriesForNetworkIds(targetNetworkIds).map(
        async ({ stores }) => {
          await this.getStore(stores, storeName)?.put?.(cleanDocument);
        },
      ),
    );
  }

  public async replicateDocumentInBackground(
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

    void Promise.all(
      this.storesForNetworkIds(targetNetworkIds).map((stores) =>
        this.getStore(stores, storeName)?.put?.(cleanDocument),
      ),
    ).catch((error) => {
      Kernel.logger.warn?.(
        `OrbitDB replicated document refresh failed: store=${storeName}` +
          ` id=${this.stringValue(cleanDocument, 'id') ?? 'unknown'}` +
          ` error=${String(error)}`,
      );
    });
  }

  public findHead(key: string): Promise<Record<string, unknown> | undefined> {
    this.assertReady();

    return Promise.resolve(this.cachedHeads.get(key));
  }

  public async findPersistedHead(
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    this.assertReady();

    return this.findStoredHead(key);
  }

  public findCachedHeadsByPrefix(
    prefix: string,
  ): Array<Record<string, unknown>> {
    return [...this.cachedHeads.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
  }

  public findCachedHead(key: string): Record<string, unknown> | undefined {
    return this.cachedHeads.get(key);
  }

  public cacheHeadLocally(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
  ): void {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);
    const targetNetworkIds = [
      ...new Set([...networkIds, ...this.networkIdsFromDocument(cleanValue)]),
    ];

    for (const headKey of this.headKeyDeriver.cachedKeys(key, cleanValue)) {
      const cachedHead = this.cacheHead(headKey, cleanValue);

      if (!cachedHead) {
        continue;
      }

      for (const networkId of targetNetworkIds) {
        void this.persistHeadCache(networkId, headKey, cachedHead);
      }
    }
  }

  public replicateHeadInBackground(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
  ): void {
    this.cacheHeadLocally(key, value, networkIds);
    void this.putHead(key, value, networkIds, { force: true }).catch(
      (error) => {
        Kernel.logger.warn?.(
          `OrbitDB replicated head refresh failed: key=${key} error=${String(error)}`,
        );
      },
    );
  }

  public async putHead(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
    options: { force?: boolean } = {},
  ): Promise<void> {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);
    const currentValue = this.cachedHeads.get(key);
    const hasSameCachedContent = this.hasSameCachedHeadContent(
      currentValue,
      cleanValue,
    );

    if (!options.force && hasSameCachedContent) {
      const targetDocument = currentValue ?? cleanValue;
      const skipTargetNetworkIds = await this.targetNetworkIdsForHeadWrite(
        targetDocument,
        networkIds,
      );

      if (
        await this.shouldSkipHeadWrite(
          key,
          cleanValue,
          skipTargetNetworkIds,
          false,
          hasSameCachedContent,
        )
      ) {
        return;
      }
    }

    const cachedValue = this.nextHeadWriteValue(
      key,
      cleanValue,
      currentValue,
      hasSameCachedContent,
    );

    if (!cachedValue) {
      return;
    }

    const targetNetworkIds = await this.targetNetworkIdsForHeadWrite(
      cachedValue,
      networkIds,
    );

    await Promise.all(
      this.networkStoreEntriesForNetworkIds(targetNetworkIds).map(
        async ({ networkId, stores }) => {
          await stores.heads.put?.(key, cachedValue);
          await this.persistHeadCache(networkId, key, cachedValue);

          for (const derivedKey of this.headKeyDeriver.explicitKeys(
            key,
            cachedValue,
          )) {
            if (derivedKey === key) {
              continue;
            }

            const cachedDerivedHead = this.cacheHead(derivedKey, cachedValue);

            if (cachedDerivedHead) {
              await this.persistHeadCache(
                networkId,
                derivedKey,
                cachedDerivedHead,
              );
            }
          }
        },
      ),
    );
  }
}
