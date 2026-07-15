import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import Kernel from '@haskou/ddd-kernel';

import LocalOrbitDBReplicatedHeadCache from './LocalOrbitDBReplicatedHeadCache';
import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBEntry } from './OrbitDBEntry';
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
  private static readonly DOCUMENT_STORE_NAMES: OrbitDBReplicatedDocumentStoreName[] =
    [
      'calls',
      'communities',
      'conversations',
      'identities',
      'contentReplication',
      'keychains',
      'messages',
      'moderationLogs',
      'notificationSettings',
      'notifications',
      'pins',
      'polls',
      'reactions',
      'requests',
      'stickerPacks',
      'stickerUserLibraries',
    ];

  // TODO: Move indexed head merge policy to OrbitDBHeadIndex before adding
  // per-index record identity or freshness rules here.
  private static readonly INDEX_HEAD_COLLECTION_NAMES = new Set([
    'conversations',
    'messages',
    'pins',
    'reactions',
    'summaries',
  ]);

  private static readonly HYDRATION_BATCH_SIZE = 16;

  private readonly storesByNetworkId = new Map<
    string,
    OrbitDBPrivateNetworkStores
  >();

  private readonly cachedHeads = new Map<string, Record<string, unknown>>();

  private readonly persistedHeadKeysByNetworkId = new Map<
    string,
    Set<string>
  >();

  private readonly documentUpdateListeners = new Map<
    OrbitDBReplicatedDocumentStoreName,
    Set<(document: Record<string, unknown>) => void | Promise<void>>
  >();

  private readonly documentUpdateListenerStores = new Map<
    OrbitDBReplicatedDocumentStoreName,
    WeakSet<OrbitDBDatabase>
  >();

  private readonly documentProjectionHeadSignatures = new WeakMap<
    OrbitDBDatabase,
    string
  >();

  private readonly documentProjectionReconciliations = new WeakMap<
    OrbitDBDatabase,
    Promise<void>
  >();

  private readonly pendingDocumentProjectionHeadSignatures = new WeakMap<
    OrbitDBDatabase,
    string | undefined
  >();

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

  private notifyDocumentUpdated(
    storeName: OrbitDBReplicatedDocumentStoreName,
    value: unknown,
  ): void {
    const document = this.recordValue(value);

    if (!document) {
      return;
    }

    for (const listener of this.documentUpdateListeners.get(storeName) ?? []) {
      void Promise.resolve(listener(document)).catch((error) => {
        Kernel.logger.warn?.(
          `OrbitDB document projection failed: store=${storeName} error=${String(error)}`,
        );
      });
    }
  }

  private documentProjectionHeadSignature(
    heads: OrbitDBEntry[] | undefined,
  ): string | undefined {
    if (!heads) {
      return undefined;
    }

    const hashes = heads
      .map((head) => head.hash)
      .filter((hash): hash is string => typeof hash === 'string')
      .sort();

    return hashes.length === heads.length ? JSON.stringify(hashes) : undefined;
  }

  private reconcileDocumentProjection(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
    heads: OrbitDBEntry[] | undefined,
  ): void {
    const headSignature = this.documentProjectionHeadSignature(heads);

    if (
      headSignature &&
      this.documentProjectionHeadSignatures.get(store) === headSignature
    ) {
      return;
    }

    this.pendingDocumentProjectionHeadSignatures.set(store, headSignature);
    this.startDocumentProjectionReconciliation(storeName, store);
  }

  private startDocumentProjectionReconciliation(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): void {
    if (this.documentProjectionReconciliations.has(store)) {
      return;
    }

    const reconciliation = this.drainDocumentProjectionReconciliations(
      storeName,
      store,
    )
      .catch((error: unknown) => {
        Kernel.logger.warn?.(
          `OrbitDB document projection reconciliation failed: store=${storeName}` +
            ` error=${String(error)}`,
        );
      })
      .finally(() => {
        if (
          this.documentProjectionReconciliations.get(store) === reconciliation
        ) {
          this.documentProjectionReconciliations.delete(store);
        }

        if (this.pendingDocumentProjectionHeadSignatures.has(store)) {
          this.startDocumentProjectionReconciliation(storeName, store);
        }
      });

    this.documentProjectionReconciliations.set(store, reconciliation);
  }

  private async drainDocumentProjectionReconciliations(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): Promise<void> {
    while (this.pendingDocumentProjectionHeadSignatures.has(store)) {
      const headSignature =
        this.pendingDocumentProjectionHeadSignatures.get(store);
      this.pendingDocumentProjectionHeadSignatures.delete(store);

      if (
        headSignature &&
        this.documentProjectionHeadSignatures.get(store) === headSignature
      ) {
        continue;
      }

      await this.projectCanonicalDocuments(storeName, store);

      if (headSignature) {
        this.documentProjectionHeadSignatures.set(store, headSignature);
      }
    }
  }

  private async projectCanonicalDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): Promise<void> {
    const listeners = this.documentUpdateListeners.get(storeName);

    if (!listeners || listeners.size === 0) {
      return;
    }

    const startedAt = process.hrtime.bigint();
    const projectedDocuments = await this.bootstrapDocumentUpdateListener(
      store,
      listeners,
    );
    const elapsedMilliseconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    Kernel.logger.debug?.(
      `OrbitDB document projection reconciled: store=${storeName}` +
        ` documents=${projectedDocuments}` +
        ` durationMs=${elapsedMilliseconds.toFixed(3)}`,
    );
  }

  private registerDocumentUpdateListener(
    storeName: OrbitDBReplicatedDocumentStoreName,
    store: OrbitDBDatabase,
  ): void {
    const registeredStores =
      this.documentUpdateListenerStores.get(storeName) ?? new WeakSet();

    if (registeredStores.has(store)) {
      return;
    }

    store.events?.on?.('update', (entry) =>
      this.notifyDocumentUpdated(storeName, entry.payload?.value),
    );
    store.events?.on?.('join', (_peerId, heads) =>
      this.reconcileDocumentProjection(storeName, store, heads),
    );
    registeredStores.add(store);
    this.documentUpdateListenerStores.set(storeName, registeredStores);
  }

  private registerDocumentUpdateListeners(
    stores: OrbitDBPrivateNetworkStores,
  ): void {
    for (const storeName of this.documentUpdateListeners.keys()) {
      const store = this.getStore(stores, storeName);

      if (store) {
        this.registerDocumentUpdateListener(storeName, store);
      }
    }
  }

  private async notifyBootstrappedDocument(
    listeners: Set<(document: Record<string, unknown>) => void | Promise<void>>,
    document: Record<string, unknown>,
  ): Promise<void> {
    for (const listener of listeners) {
      await listener(document);
    }
  }

  private async yieldAfterHydrationBatch(index: number): Promise<void> {
    if (
      (index + 1) % OrbitDBReplicatedStateRegistry.HYDRATION_BATCH_SIZE !==
      0
    ) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  private async bootstrapDocumentUpdateListener(
    store: OrbitDBDatabase,
    listeners: Set<(document: Record<string, unknown>) => void | Promise<void>>,
  ): Promise<number> {
    const records = await this.allRecords(store);

    for (let index = 0; index < records.length; index++) {
      await this.notifyBootstrappedDocument(listeners, records[index].value);
      await this.yieldAfterHydrationBatch(index);
    }

    return records.length;
  }

  private async bootstrapDocumentUpdateListeners(
    stores: OrbitDBPrivateNetworkStores,
  ): Promise<void> {
    for (const [storeName, listeners] of this.documentUpdateListeners) {
      const store = this.getStore(stores, storeName);

      if (!store) {
        continue;
      }

      await this.bootstrapDocumentUpdateListener(store, listeners);
    }
  }

  private async hydrateHeadRecord(
    networkId: string,
    record: { key?: string; value: Record<string, unknown> },
  ): Promise<boolean> {
    if (!record.key) {
      return true;
    }

    this.markPersistedHeadKey(networkId, record.key);

    let persisted = true;

    for (const key of this.headKeyDeriver.cachedKeys(
      record.key,
      record.value,
    )) {
      const cachedHead = this.cacheHead(key, record.value);

      if (cachedHead) {
        persisted =
          (await this.persistHeadCache(networkId, key, cachedHead)) &&
          persisted;
      }
    }

    return persisted;
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

  private headKeysFromUpdate(
    networkId: string,
    entry: { payload?: { key?: string } },
    record: Record<string, unknown>,
  ): string[] {
    const explicitKey = entry.payload?.key;

    if (explicitKey) {
      this.markPersistedHeadKey(networkId, explicitKey);

      return this.headKeyDeriver.cachedKeys(explicitKey, record);
    }

    return this.headKeyDeriver.implicitKeys(record);
  }

  private cacheHeadUpdate(
    networkId: string,
    entry: { payload?: { key?: string; value?: unknown } },
  ): void {
    const payloadValue = entry.payload?.value;

    if (!this.isRecord(payloadValue)) {
      return;
    }

    const record = this.recordValue(payloadValue);

    if (!record) {
      return;
    }

    const keys = this.headKeysFromUpdate(networkId, entry, record);

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

    for (let index = 0; index < records.length; index++) {
      persistedAllHeads =
        (await this.hydrateHeadRecord(networkId, records[index])) &&
        persistedAllHeads;

      await this.yieldAfterHydrationBatch(index);
    }

    if (persistedAllHeads) {
      await this.markHeadCacheWarm(networkId);
    }

    return records.length;
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
        this.markPersistedHeadKey(networkId, head.key);

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

  private markPersistedHeadKey(networkId: string, key: string): void {
    const keys = this.persistedHeadKeysByNetworkId.get(networkId) ?? new Set();

    keys.add(key);
    this.persistedHeadKeysByNetworkId.set(networkId, keys);
  }

  private hasPersistedHeadKey(networkId: string, key: string): boolean {
    return this.persistedHeadKeysByNetworkId.get(networkId)?.has(key) ?? false;
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

  private isPersistedForAllTargetNetworks(
    key: string,
    networkIds: string[],
  ): boolean {
    const entries = this.networkStoreEntriesForNetworkIds(networkIds);

    return (
      entries.length > 0 &&
      entries.every(({ networkId }) => this.hasPersistedHeadKey(networkId, key))
    );
  }

  private hasSameCachedHeadContent(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): boolean {
    return current !== undefined && this.isSameHeadContent(current, candidate);
  }

  private shouldSkipHeadWrite(
    key: string,
    networkIds: string[],
    hasSameCachedContent: boolean,
    force: boolean = false,
  ): boolean {
    return (
      !force &&
      hasSameCachedContent &&
      this.isPersistedForAllTargetNetworks(key, networkIds)
    );
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
    force: boolean = false,
  ): Record<string, unknown> | undefined {
    if (force) {
      return this.cacheHead(key, value) ?? current;
    }

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
    this.registerDocumentUpdateListeners(stores);
    stores.heads.events?.on?.('update', (entry) =>
      this.cacheHeadUpdate(networkId, entry),
    );

    const persistedHeadCache = this.headCache
      ? await this.hydratePersistedHeadCache(networkId)
      : { heads: 0, warm: false };

    if (persistedHeadCache.warm && persistedHeadCache.heads > 0) {
      await this.bootstrapDocumentUpdateListeners(stores);

      return;
    }

    await this.hydrateHeadCache(networkId, stores);
    await this.bootstrapDocumentUpdateListeners(stores);
  }

  public async unregister(networkId: string): Promise<void> {
    const stores = this.storesByNetworkId.get(networkId);

    this.storesByNetworkId.delete(networkId);
    this.persistedHeadKeysByNetworkId.delete(networkId);
    this.cachedHeads.clear();

    await stores?.stop();
  }

  public clear(): void {
    this.storesByNetworkId.clear();
    this.persistedHeadKeysByNetworkId.clear();
    this.cachedHeads.clear();
  }

  public async onDocumentUpdated(
    storeName: OrbitDBReplicatedDocumentStoreName,
    listener: (document: Record<string, unknown>) => void | Promise<void>,
  ): Promise<void> {
    const listeners = this.documentUpdateListeners.get(storeName) ?? new Set();

    listeners.add(listener);
    this.documentUpdateListeners.set(storeName, listeners);

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);

      if (!store) {
        continue;
      }

      this.registerDocumentUpdateListener(storeName, store);

      await this.bootstrapDocumentUpdateListener(store, new Set([listener]));
    }
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

  public async queryDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
    networkIds: string[] = [],
  ): Promise<Record<string, unknown>[]> {
    this.assertReady();

    const results = await Promise.all(
      this.networkStoreEntriesForNetworkIds(networkIds).map(
        async ({ stores }) => {
          const store = this.getStore(stores, storeName);

          if (!store) {
            return [];
          }

          if (store.query) {
            return store.query(matcher);
          }

          return (await this.allRecords(store))
            .map((record) => record.value)
            .filter(matcher);
        },
      ),
    );

    return results.flat();
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
    force: boolean = false,
  ): void {
    void this.putHead(key, value, networkIds, force).catch((error) => {
      Kernel.logger.warn?.(
        `OrbitDB replicated head refresh failed: key=${key} error=${String(error)}`,
      );
    });
  }

  public async putHead(
    key: string,
    value: Record<string, unknown>,
    networkIds: string[] = [],
    force: boolean = false,
  ): Promise<void> {
    this.assertReady();
    const cleanValue = this.cleanDocument(value);
    const currentValue = this.cachedHeads.get(key);
    const hasSameCachedContent = this.hasSameCachedHeadContent(
      currentValue,
      cleanValue,
    );

    if (!force && hasSameCachedContent) {
      const targetDocument = currentValue ?? cleanValue;
      const skipTargetNetworkIds = await this.targetNetworkIdsForHeadWrite(
        targetDocument,
        networkIds,
      );

      if (
        this.shouldSkipHeadWrite(
          key,
          skipTargetNetworkIds,
          hasSameCachedContent,
          force,
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
      force,
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
          this.markPersistedHeadKey(networkId, key);
          await this.persistHeadCache(networkId, key, cachedValue);
        },
      ),
    );
  }
}
