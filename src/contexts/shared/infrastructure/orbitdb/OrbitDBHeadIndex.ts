import Kernel from '@haskou/ddd-kernel';

import OrbitDBDocumentDeduplicator from './OrbitDBDocumentDeduplicator';
import { OrbitDBHeadIndexOptions } from './OrbitDBHeadIndexOptions';
import { OrbitDBHeadIndexPutOptions } from './OrbitDBHeadIndexPutOptions';
import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

export default class OrbitDBHeadIndex<TDocument extends object> {
  private readonly deduplicator: OrbitDBDocumentDeduplicator<TDocument>;

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
  ): Record<string, unknown> {
    return {
      ...metadata,
      [this.options.collectionName]: records,
      updatedAt: Date.now(),
    };
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
    return this.documentsFromHead(await this.registry.findHead(key));
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

    merged.set(recordId, record);

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
  ): void {
    const cachedHead = this.registry.findCachedHead(key);

    if (!cachedHead) {
      void this.putRecord(key, metadata, record, networkIds).catch((error) => {
        Kernel.logger.warn?.(
          `OrbitDB head index record refresh failed: key=${key} error=${String(error)}`,
        );
      });

      return;
    }

    const records = this.mergeRecords(this.recordsFromHead(cachedHead), record);

    this.registry.replicateHeadInBackground(
      key,
      this.recordsHead(metadata, records),
      networkIds,
    );
  }
}
