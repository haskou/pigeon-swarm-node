import Kernel from '@app/Kernel';
import HttpRequestContext from '@app/shared/infrastructure/express/HttpRequestContext';

import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBQueryDocumentsMode } from './OrbitDBQueryDocumentsMode';
import { OrbitDBQueryDocumentsOptions } from './OrbitDBQueryDocumentsOptions';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';
import ReplicatedStateNotReadyError from './ReplicatedStateNotReadyError';

export default class OrbitDBReplicatedStateRegistry {
  private static readonly HTTP_QUERY_WARNING_THRESHOLD_MS = 100;
  private static readonly BACKGROUND_QUERY_LOG_THRESHOLD_MS = 1000;

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

  private queryCaller(): string {
    const stack = new Error().stack || '';
    const callerLine = stack
      .split('\n')
      .map((line) => line.trim())
      .find(
        (line) =>
          line.startsWith('at ') &&
          !line.includes('OrbitDBReplicatedStateRegistry') &&
          !line.includes('Error'),
      );

    return callerLine || 'unknown';
  }

  private slowQueryThresholdMs(isHttpRequest: boolean): number {
    return isHttpRequest
      ? OrbitDBReplicatedStateRegistry.HTTP_QUERY_WARNING_THRESHOLD_MS
      : OrbitDBReplicatedStateRegistry.BACKGROUND_QUERY_LOG_THRESHOLD_MS;
  }

  private shouldWarnSlowQuery(
    isHttpRequest: boolean,
    mode: OrbitDBQueryDocumentsMode,
  ): boolean {
    return isHttpRequest || mode === 'read' || mode === 'fallback';
  }

  private slowQueryMessage(params: {
    deduplicatedDocuments: number;
    durationMs: number;
    matchedDocuments: number;
    mode: OrbitDBQueryDocumentsMode;
    operation: string;
    request: string;
    scannedDocuments: number | string;
    storeName: OrbitDBReplicatedDocumentStoreName;
  }): string {
    return (
      `OrbitDB queryDocuments slow: store=${params.storeName}` +
      ` mode=${params.mode}` +
      ` operation="${params.operation}"` +
      ` durationMs=${params.durationMs}` +
      ` scannedDocuments=${params.scannedDocuments}` +
      ` matchedDocuments=${params.matchedDocuments}` +
      ` returnedDocuments=${params.deduplicatedDocuments}` +
      ` httpRequest="${params.request}"`
    );
  }

  private logSlowQuery(
    storeName: OrbitDBReplicatedDocumentStoreName,
    durationMs: number,
    matchedDocuments: number,
    deduplicatedDocuments: number,
    scannedDocuments: number | undefined,
    options: OrbitDBQueryDocumentsOptions,
  ): void {
    const requestContext = HttpRequestContext.current();
    const isHttpRequest = requestContext !== undefined;
    const thresholdMs = this.slowQueryThresholdMs(isHttpRequest);

    if (durationMs < thresholdMs) {
      return;
    }

    const mode = options.mode || 'read';
    const operation = options.operation || this.queryCaller();
    const scanned = scannedDocuments ?? 'unknown';
    const request = requestContext
      ? `${requestContext.method} ${requestContext.originalUrl}`
      : 'none';
    const message = this.slowQueryMessage({
      deduplicatedDocuments,
      durationMs,
      matchedDocuments,
      mode,
      operation,
      request,
      scannedDocuments: scanned,
      storeName,
    });

    if (this.shouldWarnSlowQuery(isHttpRequest, mode)) {
      Kernel.logger?.warn(message);

      return;
    }

    Kernel.logger?.info(message);
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

  private async networkIdsFromRelatedDocument(
    document: Record<string, unknown>,
  ): Promise<string[]> {
    const related = this.relatedDocumentId(document);

    if (!related) {
      const identityId = this.relatedIdentityId(document);

      if (!identityId) {
        return [];
      }

      return this.networkIdsFromRelatedHead({
        storeName: 'identities',
        value: identityId,
      });
    }

    return this.networkIdsFromRelatedHead(related);
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

  public async register(
    networkId: string,
    stores: OrbitDBReplicatedStateStores,
  ): Promise<void> {
    this.storesByNetworkId.set(networkId, stores);
    stores.heads.events?.on?.('update', (entry) => this.cacheHeadUpdate(entry));
    await this.hydrateHeadCache(stores);
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

  public async queryDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
    options: OrbitDBQueryDocumentsOptions = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.assertReady();
    const startedAt = Date.now();
    const documents: Array<Record<string, unknown>> = [];
    let scannedDocuments: number | undefined = 0;

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);

      if (!store) {
        continue;
      }
      let matches: Array<Record<string, unknown>>;

      if (store.query) {
        matches = await store.query(matcher);
        scannedDocuments = undefined;
      } else {
        const storeDocuments = await this.allDocuments(store);

        if (scannedDocuments !== undefined) {
          scannedDocuments += storeDocuments.length;
        }

        matches = storeDocuments.filter(matcher);
      }

      documents.push(...matches);
    }

    const deduplicatedDocuments = this.deduplicateDocuments(documents);

    this.logSlowQuery(
      storeName,
      Date.now() - startedAt,
      documents.length,
      deduplicatedDocuments.length,
      scannedDocuments,
      options,
    );

    return deduplicatedDocuments;
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

    if (HttpRequestContext.current()) {
      return undefined;
    }

    for (const stores of this.storesByNetworkId.values()) {
      const directRecord = this.recordValue(await stores.heads.get?.(key));

      if (directRecord) {
        this.cacheHead(key, directRecord);

        return directRecord;
      }
    }

    return undefined;
  }

  public findCachedHeadsByPrefix(
    prefix: string,
  ): Array<Record<string, unknown>> {
    return [...this.cachedHeads.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
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
