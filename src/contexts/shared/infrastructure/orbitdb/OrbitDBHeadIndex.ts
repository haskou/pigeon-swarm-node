import Kernel from '@haskou/ddd-kernel';
import { assert } from '@haskou/value-objects';

import { OrbitDBDocumentDeduplicator } from './OrbitDBDocumentDeduplicator';
import { OrbitDBHeadIndexOptions } from './OrbitDBHeadIndexOptions';
import { OrbitDBHeadIndexPutOptions } from './OrbitDBHeadIndexPutOptions';
import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

export class OrbitDBHeadIndex<TDocument extends object> {
  private static readonly pendingRecordsByRegistry = new WeakMap<
    OrbitDBReplicatedStateRegistry,
    Map<string, Record<string, unknown>[]>
  >();

  private readonly deduplicator: OrbitDBDocumentDeduplicator<TDocument>;

  private readonly canonicalProjection?: Promise<void>;

  private readonly canonicalRecordsById = new Map<
    string,
    Record<string, unknown>
  >();

  private readonly canonicalRecordsByKey = new Map<
    string,
    Record<string, unknown>[]
  >();

  private readonly canonicalKeysByRecordId = new Map<string, Set<string>>();

  private readonly canonicalProjectionKeys = new Set<string>();

  private readonly canonicalProjectionRefreshes = new Map<
    string,
    Promise<void>
  >();

  private canonicalProjectionCompleteRevision?: number;

  private canonicalProjectionRevision: number;

  private readonly recordMergeQueues = new Map<string, Promise<void>>();

  private get pendingRecords(): Map<string, Record<string, unknown>[]> {
    let pendingRecords = OrbitDBHeadIndex.pendingRecordsByRegistry.get(
      this.registry,
    );

    if (!pendingRecords) {
      pendingRecords = new Map<string, Record<string, unknown>[]>();
      OrbitDBHeadIndex.pendingRecordsByRegistry.set(
        this.registry,
        pendingRecords,
      );
    }

    return pendingRecords;
  }

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly options: OrbitDBHeadIndexOptions<TDocument>,
  ) {
    this.canonicalProjectionRevision = this.registryProjectionRevision();
    this.deduplicator = new OrbitDBDocumentDeduplicator({
      merge: this.options.merge,
      recordId: (document) => this.options.recordId(document),
      shouldReplace: this.options.shouldReplace,
    });
    const storeName = this.options.canonicalStoreName;

    if (storeName && this.options.canonicalIndexKeys) {
      const initialRevision = this.canonicalProjectionRevision;
      this.canonicalProjection = this.registry
        .onDocumentUpdated?.(storeName, (document) =>
          this.projectReplicatedCanonicalRecord(document),
        )
        .then(() => {
          if (initialRevision === this.registryProjectionRevision()) {
            this.canonicalProjectionCompleteRevision = initialRevision;
          }
        });
    }
  }

  private registryProjectionRevision(): number {
    return this.registry.getDocumentProjectionRevision?.() ?? 0;
  }

  private isCanonicalRemoval(record: Record<string, unknown>): boolean {
    return record.removed === true || record.deleted === true;
  }

  private freshestCanonicalRecord(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!current || this.shouldReplaceRecord(current, candidate)) {
      return candidate;
    }

    return current;
  }

  private canonicalRecord(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
    acceptRemoval: boolean,
  ): Record<string, unknown> | undefined {
    if (this.isCanonicalRemoval(candidate)) {
      return acceptRemoval
        ? this.freshestCanonicalRecord(current, candidate)
        : current;
    }
    const candidateDocument = this.options.documentFromRecord(candidate);

    if (!candidateDocument) return current;

    if (current && this.isCanonicalRemoval(current)) {
      return this.freshestCanonicalRecord(current, candidate);
    }

    return this.mergeRecord(current, candidate);
  }

  private projectCanonicalKey(
    key: string,
    canonical: Record<string, unknown>,
    included: boolean,
  ): void {
    const records = this.recordsWithout(
      this.canonicalRecordsByKey.get(key) ?? [],
      canonical,
    );

    if (included) records.push(canonical);
    this.canonicalRecordsByKey.set(key, records);
  }

  private projectCanonicalRecord(
    record: Record<string, unknown>,
    acceptRemoval: boolean,
  ): void {
    const recordId = this.options.recordId(record);
    const indexKeys = this.options.canonicalIndexKeys;

    if (!recordId || !indexKeys) return;
    const current = this.canonicalRecordsById.get(recordId);
    const canonical = this.canonicalRecord(current, record, acceptRemoval);

    if (!canonical || canonical === current) return;
    this.updateCanonicalProjection(recordId, canonical);
  }

  private projectReplicatedCanonicalRecord(
    record: Record<string, unknown>,
  ): void {
    this.projectCanonicalRecord(record, false);
  }

  private projectAuthorizedCanonicalRecord(
    record: Record<string, unknown>,
  ): void {
    this.projectCanonicalRecord(record, true);
  }

  private updateCanonicalProjection(
    recordId: string,
    canonical: Record<string, unknown>,
  ): void {
    const indexKeys = this.options.canonicalIndexKeys;

    assert(indexKeys, new Error('Canonical index keys are required'));
    const previousKeys =
      this.canonicalKeysByRecordId.get(recordId) ?? new Set();
    const nextKeys = new Set(indexKeys(canonical));
    const affectedKeys = new Set([...previousKeys, ...nextKeys]);
    const isDocument = this.options.documentFromRecord(canonical) !== undefined;

    this.canonicalRecordsById.set(recordId, canonical);
    this.canonicalKeysByRecordId.set(recordId, nextKeys);

    for (const key of affectedKeys) {
      this.projectCanonicalKey(key, canonical, isDocument && nextKeys.has(key));
    }
  }

  private clearCanonicalProjection(): void {
    this.canonicalRecordsById.clear();
    this.canonicalRecordsByKey.clear();
    this.canonicalKeysByRecordId.clear();
    this.canonicalProjectionKeys.clear();
  }

  private invalidateCanonicalProjectionIfStale(): number {
    const revision = this.registryProjectionRevision();

    if (revision !== this.canonicalProjectionRevision) {
      this.clearCanonicalProjection();
      this.canonicalProjectionRevision = revision;
      this.canonicalProjectionCompleteRevision = undefined;
    }

    return revision;
  }

  private async refreshCanonicalProjection(key: string): Promise<void> {
    const revision = this.invalidateCanonicalProjectionIfStale();

    if (
      this.canonicalProjectionCompleteRevision === revision ||
      this.canonicalProjectionKeys.has(key)
    ) {
      return;
    }
    const pending = this.canonicalProjectionRefreshes.get(key);

    if (pending) {
      await pending;

      return this.refreshCanonicalProjection(key);
    }
    const storeName = this.options.canonicalStoreName;
    const indexKeys = this.options.canonicalIndexKeys;

    if (!storeName || !indexKeys) return;
    const refresh = (async () => {
      const documents = await this.registry.queryDocuments(
        storeName,
        (document) => indexKeys(document).includes(key),
      );

      if (revision !== this.registryProjectionRevision()) return;

      for (const document of documents) {
        this.projectReplicatedCanonicalRecord(document);
      }

      this.canonicalProjectionKeys.add(key);
    })();
    this.canonicalProjectionRefreshes.set(key, refresh);

    try {
      await refresh;
    } finally {
      this.canonicalProjectionRefreshes.delete(key);
    }

    if (revision !== this.registryProjectionRevision()) {
      await this.refreshCanonicalProjection(key);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private documentsHead(
    metadata: Record<string, unknown>,
    documents: TDocument[],
    options: OrbitDBHeadIndexPutOptions<TDocument> = {},
  ): Record<string, unknown> {
    const filteredDocuments = this.deduplicate(documents).filter(
      options.filter ?? (() => true),
    );

    return {
      ...metadata,
      [this.options.collectionName]: filteredDocuments.map((document) => ({
        ...document,
      })),
      updatedAt: Date.now(),
    };
  }

  private recordsHead(
    metadata: Record<string, unknown>,
    records: Record<string, unknown>[],
    updatedAt: number = Date.now(),
  ): Record<string, unknown> {
    return {
      ...metadata,
      [this.options.collectionName]: records,
      updatedAt,
    };
  }

  private isRemoval(record: Record<string, unknown>): boolean {
    return (
      record.removed === true && this.options.recordId(record) !== undefined
    );
  }

  private recordsWithout(
    records: Record<string, unknown>[],
    record: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const removedId = this.options.recordId(record);

    return records.filter(
      (candidate) => this.options.recordId(candidate) !== removedId,
    );
  }

  private removeRecord(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[],
  ): Promise<void> {
    const previous = this.recordMergeQueues.get(key) ?? Promise.resolve();
    const next = previous
      .catch((): void => undefined)
      .then(async () => {
        const head =
          this.registry.findCachedHead(key) ??
          (await this.registry.findPersistedHead(key));
        const currentRecords = this.recordsFromHead(head);
        const records = this.recordsWithout(currentRecords, record);

        await this.registry.putHeadExactly(
          key,
          this.recordsHead(metadata, records),
          networkIds,
        );
      });

    this.recordMergeQueues.set(key, next);

    return next.finally(() => {
      if (this.recordMergeQueues.get(key) === next) {
        this.recordMergeQueues.delete(key);
      }
    });
  }

  private nextHeadUpdatedAt(head: Record<string, unknown> | undefined): number {
    return Math.max(Date.now(), this.recordFreshness(head ?? {}) + 1);
  }

  private mergeHeadRecords(
    heads: Array<Record<string, unknown> | undefined>,
  ): Record<string, unknown>[] {
    return heads
      .flatMap((head) => this.recordsFromHead(head))
      .reduce<Record<string, unknown>[]>(
        (records, record) => this.mergeRecords(records, record),
        [],
      );
  }

  private addPendingRecord(key: string, record: Record<string, unknown>): void {
    this.pendingRecords.set(
      key,
      this.mergeRecords(this.pendingRecords.get(key) ?? [], record),
    );
  }

  private removePendingRecord(
    key: string,
    record: Record<string, unknown>,
  ): void {
    const records = (this.pendingRecords.get(key) ?? []).filter(
      (pendingRecord) => pendingRecord !== record,
    );

    if (records.length === 0) {
      this.pendingRecords.delete(key);

      return;
    }

    this.pendingRecords.set(key, records);
  }

  private pendingRecordsHead(
    baseHead: Record<string, unknown> | undefined,
    pendingRecords: Record<string, unknown>[],
  ): Record<string, unknown> {
    return this.recordsHead(
      {},
      pendingRecords.reduce<Record<string, unknown>[]>(
        (records, record) => this.mergeRecords(records, record),
        this.recordsFromHead(baseHead),
      ),
    );
  }

  private numberValue(
    record: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = record[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private recordFreshness(record: Record<string, unknown>): number {
    return Math.max(
      ...['deletedAt', 'lastReplyAt', 'receivedAt', 'updatedAt', 'createdAt']
        .map((attribute) => this.numberValue(record, attribute))
        .filter((value): value is number => value !== undefined),
      0,
    );
  }

  private shouldReplaceRecord(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const currentFreshness = this.recordFreshness(current);
    const candidateFreshness = this.recordFreshness(candidate);

    if (currentFreshness !== 0 || candidateFreshness !== 0) {
      return currentFreshness <= candidateFreshness;
    }

    return true;
  }

  private cacheRecordHeadLocally(
    key: string,
    metadata: Record<string, unknown>,
    head: Record<string, unknown>,
    record: Record<string, unknown>,
  ): void {
    const records = this.mergeRecords(this.recordsFromHead(head), record);

    this.registry.cacheHeadLocally(
      key,
      this.recordsHead(metadata, records, this.nextHeadUpdatedAt(head)),
    );
  }

  private async replicateRecordHead(
    key: string,
    metadata: Record<string, unknown>,
    head: Record<string, unknown> | undefined,
    record: Record<string, unknown>,
    networkIds: string[],
  ): Promise<void> {
    const records = this.mergeRecords(this.recordsFromHead(head), record);

    await this.registry.putHead(
      key,
      this.recordsHead(metadata, records, this.nextHeadUpdatedAt(head)),
      networkIds,
    );
  }

  private async replicateRecordHeadFromLatestState(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[],
    preferPersistedHead = false,
  ): Promise<void> {
    const persistedHead = preferPersistedHead
      ? await this.registry.findPersistedHead(key)
      : undefined;
    const cachedHead = this.registry.findCachedHead(key);

    await this.replicateRecordHead(
      key,
      metadata,
      preferPersistedHead
        ? this.recordsHead(
            metadata,
            this.mergeHeadRecords([persistedHead, cachedHead]),
          )
        : (cachedHead ?? (await this.registry.findPersistedHead(key))),
      record,
      networkIds,
    );
  }

  private queueRecordHeadReplication(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[],
    preferPersistedHead = false,
  ): Promise<void> {
    const previous = this.recordMergeQueues.get(key) ?? Promise.resolve();
    const next = previous
      .catch((): void => undefined)
      .then(() =>
        this.replicateRecordHeadFromLatestState(
          key,
          metadata,
          record,
          networkIds,
          preferPersistedHead,
        ),
      )
      .then(() => this.removePendingRecord(key, record))
      .catch((error) => {
        Kernel.logger.warn?.(
          `OrbitDB head index record refresh failed: key=${key} error=${String(error)}`,
        );
      });

    this.recordMergeQueues.set(key, next);
    void next.finally(() => {
      if (this.recordMergeQueues.get(key) === next) {
        this.recordMergeQueues.delete(key);
      }
    });

    return next;
  }

  private mergeRecord(
    current: Record<string, unknown> | undefined,
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    const currentDocument = current && this.options.documentFromRecord(current);
    const candidateDocument = this.options.documentFromRecord(record);

    if (!candidateDocument) return current ?? record;

    if (!currentDocument) return record;

    if (this.options.merge) {
      return Object.fromEntries(
        Object.entries(this.options.merge(currentDocument, candidateDocument)),
      );
    }

    return this.shouldReplaceRecord(current, record) ? record : current;
  }

  private async putReplacementRecord(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[],
    options: OrbitDBHeadIndexPutOptions<TDocument>,
  ): Promise<void> {
    const previous = this.recordMergeQueues.get(key) ?? Promise.resolve();
    const next = previous
      .catch((): void => undefined)
      .then(async () => {
        const cachedHead = this.registry.findCachedHead(key);
        const currentRecords = this.recordsFromHead(
          cachedHead ?? (await this.registry.findPersistedHead(key)),
        );
        const candidateRecords = this.mergeRecords(
          currentRecords,
          record,
        ).filter(options.recordFilter ?? (() => true));
        const records = candidateRecords.filter(
          (candidate) =>
            this.options.documentFromRecord(candidate) !== undefined,
        );

        await this.registry.putHeadExactly(
          key,
          this.recordsHead(metadata, records),
          networkIds,
        );
      });
    this.recordMergeQueues.set(key, next);

    try {
      await next;
    } finally {
      if (this.recordMergeQueues.get(key) === next) {
        this.recordMergeQueues.delete(key);
      }
    }
  }

  private async putMergedRecord(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[],
    options: OrbitDBHeadIndexPutOptions<TDocument>,
  ): Promise<void> {
    const cachedHead = this.registry.findCachedHead(key);
    const records = this.mergeRecords(
      this.recordsFromHead(
        cachedHead ?? (await this.registry.findPersistedHead(key)),
      ),
      record,
    ).filter(options.recordFilter ?? (() => true));
    await this.registry.putHead(
      key,
      this.recordsHead(metadata, records),
      networkIds,
    );
  }

  private async canonicalDocuments(
    key: string,
  ): Promise<TDocument[] | undefined> {
    if (!this.canonicalProjection) return undefined;
    await this.canonicalProjection;
    await this.refreshCanonicalProjection(key);

    return (this.canonicalRecordsByKey.get(key) ?? [])
      .map((record) => this.options.documentFromRecord(record))
      .filter((document): document is TDocument => document !== undefined);
  }

  public recordsFromHead(
    head: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    const records = head?.[this.options.collectionName];

    if (!Array.isArray(records)) {
      return [];
    }

    return records.filter((record): record is Record<string, unknown> =>
      this.isRecord(record),
    );
  }

  public documentsFromHead(
    head: Record<string, unknown> | undefined,
  ): TDocument[] | undefined {
    if (!head) {
      return undefined;
    }

    return this.recordsFromHead(head)
      .map((record) => this.options.documentFromRecord(record))
      .filter((document): document is TDocument => document !== undefined);
  }

  public async find(key: string): Promise<TDocument[] | undefined> {
    const canonicalDocuments = await this.canonicalDocuments(key);

    if (canonicalDocuments) return canonicalDocuments;
    const pendingRecords = this.pendingRecords.get(key) ?? [];
    const head = await this.registry.findHead(key);

    if (pendingRecords.length === 0) {
      return this.documentsFromHead(head);
    }

    return this.documentsFromHead(
      this.pendingRecordsHead(
        head ?? (await this.registry.findPersistedHead(key)),
        pendingRecords,
      ),
    );
  }

  public cachedByPrefix(prefix: string): TDocument[] {
    this.invalidateCanonicalProjectionIfStale();
    const replicated = this.registry
      .findCachedHeadsByPrefix(prefix)
      .flatMap((value) => this.documentsFromHead(value) ?? []);
    const canonical = [...this.canonicalRecordsByKey.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .flatMap(([, records]) =>
        records
          .map((record) => this.options.documentFromRecord(record))
          .filter((document): document is TDocument => document !== undefined),
      );

    return this.deduplicate([...replicated, ...canonical]);
  }

  public documentIds(documents: TDocument[]): Set<string> {
    return new Set(
      documents.flatMap((document) => {
        const documentIds = this.options.documentIds?.(document);

        if (documentIds) {
          return documentIds;
        }

        const id = this.options.recordId(document);

        return id ? [id] : [];
      }),
    );
  }

  public deduplicate(documents: TDocument[]): TDocument[] {
    return this.deduplicator.deduplicate(documents);
  }

  public mergeRecords(
    records: Record<string, unknown>[],
    record: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const recordId = this.options.recordId(record);

    if (!recordId) {
      return records;
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const current of records) {
      const currentId = this.options.recordId(current);

      if (currentId) {
        merged.set(currentId, current);
      }
    }

    const current = merged.get(recordId);

    merged.set(recordId, this.mergeRecord(current, record));

    return [...merged.values()];
  }

  public async putDocuments(
    key: string,
    metadata: Record<string, unknown>,
    documents: TDocument[],
    options: OrbitDBHeadIndexPutOptions<TDocument> = {},
  ): Promise<void> {
    documents.forEach((document) =>
      this.projectAuthorizedCanonicalRecord(
        Object.fromEntries(Object.entries(document)),
      ),
    );
    const head = this.documentsHead(metadata, documents, options);

    if (options.replace) {
      await this.registry.putHeadExactly(key, head, options.networkIds ?? []);

      return;
    }

    await this.registry.putHead(key, head, options.networkIds ?? []);
  }

  public replicateDocumentsInBackground(
    key: string,
    metadata: Record<string, unknown>,
    documents: TDocument[],
    options: OrbitDBHeadIndexPutOptions<TDocument> = {},
  ): void {
    documents.forEach((document) =>
      this.projectAuthorizedCanonicalRecord(
        Object.fromEntries(Object.entries(document)),
      ),
    );
    this.registry.replicateHeadInBackground(
      key,
      this.documentsHead(metadata, documents, options),
      options.networkIds ?? [],
    );
  }

  public async putRecord(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[] = [],
    options: OrbitDBHeadIndexPutOptions<TDocument> = {},
  ): Promise<void> {
    this.projectAuthorizedCanonicalRecord(record);

    if (this.isRemoval(record)) {
      await this.removeRecord(key, metadata, record, networkIds);

      return;
    }

    if (options.replace) {
      await this.putReplacementRecord(
        key,
        metadata,
        record,
        networkIds,
        options,
      );

      return;
    }

    await this.putMergedRecord(key, metadata, record, networkIds, options);
  }

  public replicateRecordInBackground(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    this.projectAuthorizedCanonicalRecord(record);

    if (this.isRemoval(record)) {
      return this.removeRecord(key, metadata, record, networkIds);
    }

    const queue = this.recordMergeQueues.get(key);
    const cachedHead = this.registry.findCachedHead(key);

    if (queue) {
      if (cachedHead) {
        this.cacheRecordHeadLocally(key, metadata, cachedHead, record);
      } else {
        this.addPendingRecord(key, record);
      }

      return cachedHead
        ? Promise.resolve()
        : this.queueRecordHeadReplication(key, metadata, record, networkIds);
    }

    if (!cachedHead) {
      this.addPendingRecord(key, record);

      return this.queueRecordHeadReplication(
        key,
        metadata,
        record,
        networkIds,
        true,
      );
    }

    return this.replicateRecordHead(
      key,
      metadata,
      cachedHead,
      record,
      networkIds,
    );
  }
}
