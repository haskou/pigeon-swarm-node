import Kernel from '@haskou/ddd-kernel';

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
    this.deduplicator = new OrbitDBDocumentDeduplicator({
      recordId: (document) => this.options.recordId(document),
      shouldReplace: this.options.shouldReplace,
    });
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

  private nextHeadUpdatedAt(head: Record<string, unknown> | undefined): number {
    return Math.max(Date.now(), this.recordFreshness(head ?? {}) + 1);
  }

  private mergeHeadRecords(
    heads: Array<Record<string, unknown> | undefined>,
  ): Record<string, unknown>[] {
    return heads
      .flatMap((head) => this.recordsFromHead(head))
      .reduce<
        Record<string, unknown>[]
      >((records, record) => this.mergeRecords(records, record), []);
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
      ...['deletedAt', 'receivedAt', 'updatedAt', 'createdAt']
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
    networkIds: string[],
  ): void {
    const records = this.mergeRecords(this.recordsFromHead(head), record);

    this.registry.cacheHeadLocally(
      key,
      this.recordsHead(metadata, records, this.nextHeadUpdatedAt(head)),
      networkIds,
    );
  }

  private replicateRecordHead(
    key: string,
    metadata: Record<string, unknown>,
    head: Record<string, unknown> | undefined,
    record: Record<string, unknown>,
    networkIds: string[],
  ): void {
    const records = this.mergeRecords(this.recordsFromHead(head), record);

    this.registry.replicateHeadInBackground(
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

    this.replicateRecordHead(
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
    return this.registry
      .findCachedHeadsByPrefix(prefix)
      .flatMap((head) => this.documentsFromHead(head) ?? []);
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

    if (!current || this.shouldReplaceRecord(current, record)) {
      merged.set(recordId, record);
    }

    return [...merged.values()];
  }

  public async putDocuments(
    key: string,
    metadata: Record<string, unknown>,
    documents: TDocument[],
    options: OrbitDBHeadIndexPutOptions<TDocument> = {},
  ): Promise<void> {
    await this.registry.putHead(
      key,
      this.documentsHead(metadata, documents, options),
      options.networkIds ?? [],
    );
  }

  public replicateDocumentsInBackground(
    key: string,
    metadata: Record<string, unknown>,
    documents: TDocument[],
    options: OrbitDBHeadIndexPutOptions<TDocument> = {},
  ): void {
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
  ): Promise<void> {
    const records = this.mergeRecords(
      this.recordsFromHead(await this.registry.findPersistedHead(key)),
      record,
    );

    await this.registry.putHead(
      key,
      this.recordsHead(metadata, records),
      networkIds,
    );
  }

  public replicateRecordInBackground(
    key: string,
    metadata: Record<string, unknown>,
    record: Record<string, unknown>,
    networkIds: string[] = [],
  ): Promise<void> {
    const queue = this.recordMergeQueues.get(key);
    const cachedHead = this.registry.findCachedHead(key);

    if (queue) {
      if (cachedHead) {
        this.cacheRecordHeadLocally(
          key,
          metadata,
          cachedHead,
          record,
          networkIds,
        );
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

    this.replicateRecordHead(key, metadata, cachedHead, record, networkIds);

    return Promise.resolve();
  }
}
