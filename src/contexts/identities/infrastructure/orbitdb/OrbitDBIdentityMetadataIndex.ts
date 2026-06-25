import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import IdentityMetadataIndex from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataIndex';
import { IdentityMetadataRecord } from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import HttpRequestContext from '@app/shared/infrastructure/express/HttpRequestContext';
import { PrimitiveOf } from '@haskou/value-objects';

import { OrbitDBIdentityMetadataDocument } from './documents/OrbitDBIdentityMetadataDocument';

export default class OrbitDBIdentityMetadataIndex extends IdentityMetadataIndex {
  private readonly activeHeadRepairs = new Set<string>();

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private identityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'identityId') ||
      this.stringValue(document, 'id')
    );
  }

  private networkIdsFrom(
    document: Record<string, unknown>,
  ): string[] | undefined {
    const networkId = this.stringValue(document, 'networkId');

    if (this.isStringArray(document.networkIds)) {
      return document.networkIds;
    }

    return networkId ? [networkId] : undefined;
  }

  private identityFrom(
    document: Record<string, unknown>,
  ): Identity | undefined {
    if (typeof document.identity !== 'object' || document.identity === null) {
      return undefined;
    }

    try {
      return Identity.fromPrimitives(
        document.identity as PrimitiveOf<Identity>,
      );
    } catch {
      return undefined;
    }
  }

  private toRecord(
    document: Record<string, unknown>,
  ): IdentityMetadataRecord | undefined {
    const cid = this.stringValue(document, 'cid');
    const identityId = this.identityIdFrom(document);

    if (!cid || !identityId || document.deleted === true) {
      return undefined;
    }

    return {
      cid,
      handle: this.stringValue(document, 'handle'),
      identity: this.identityFrom(document),
      identityId,
      networkId: this.stringValue(document, 'networkId'),
      networkIds: this.networkIdsFrom(document),
      previousCid: this.stringValue(document, 'previousCid'),
      receivedAt: this.numberValue(document, 'receivedAt') || 0,
      version: this.numberValue(document, 'version') || 0,
    };
  }

  private toStorageDocument(
    record: IdentityMetadataRecord,
    deleted: boolean = false,
  ): OrbitDBIdentityMetadataDocument {
    return {
      cid: record.cid,
      deleted,
      handle: record.handle,
      id: record.identityId,
      identity: record.identity?.toPrimitives(),
      identityId: record.identityId,
      networkId: record.networkId,
      networkIds: record.networkIds,
      previousCid: record.previousCid,
      receivedAt: record.receivedAt,
      version: record.version,
    };
  }

  private deduplicateDocuments(
    documents: IdentityMetadataRecord[],
  ): IdentityMetadataRecord[] {
    const deduplicated = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      deduplicated.set(`${document.identityId}:${document.cid}`, document);
    }

    return this.sortByFreshness([...deduplicated.values()]);
  }

  private sortByFreshness(
    documents: IdentityMetadataRecord[],
  ): IdentityMetadataRecord[] {
    return [...documents].sort(
      (left, right) =>
        right.version - left.version || right.receivedAt - left.receivedAt,
    );
  }

  private identityHeadKey(identityId: string): string {
    return `identity:${identityId}`;
  }

  private handleHeadKey(handle: string): string {
    return `identity-handle:${handle}`;
  }

  private isHttpRequest(): boolean {
    return HttpRequestContext.current() !== undefined;
  }

  private async findHead(
    key: string,
  ): Promise<IdentityMetadataRecord | undefined> {
    const document = await this.registry.findHead(key);

    return document ? this.toRecord(document) : undefined;
  }

  private latestRecordFrom(
    records: IdentityMetadataRecord[],
  ): IdentityMetadataRecord | undefined {
    const [latest] = this.deduplicateDocuments(records);

    return latest;
  }

  private async readRepairHead(
    head: IdentityMetadataRecord | undefined,
    latest: IdentityMetadataRecord,
  ): Promise<void> {
    if (head?.cid === latest.cid) {
      return;
    }

    await this.putHeads(latest);
  }

  private repairHeadInBackground(
    repairKey: string,
    repair: () => Promise<void>,
  ): void {
    if (this.activeHeadRepairs.has(repairKey)) {
      return;
    }

    this.activeHeadRepairs.add(repairKey);
    void repair()
      .catch((): undefined => undefined)
      .finally(() => {
        this.activeHeadRepairs.delete(repairKey);
      });
  }

  private repairIdentityHeadInBackground(
    identityId: string,
    head: IdentityMetadataRecord,
  ): void {
    this.repairHeadInBackground(this.identityHeadKey(identityId), async () => {
      const latest = this.latestRecordFrom([
        head,
        ...(await this.findStoredRecordsByIdentityId(identityId)),
      ]);

      if (latest) {
        await this.readRepairHead(head, latest);
      }
    });
  }

  private repairHandleHeadInBackground(
    handle: string,
    head: IdentityMetadataRecord,
  ): void {
    this.repairHeadInBackground(this.handleHeadKey(handle), async () => {
      const latest = this.latestRecordFrom([
        head,
        ...(await this.findStoredRecordsByHandle(handle)),
      ]);

      if (latest) {
        await this.readRepairHead(head, latest);
      }
    });
  }

  private async findStoredRecordsByIdentityId(
    identityId: string,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) =>
        document.deleted !== true &&
        Boolean(this.stringValue(document, 'cid')) &&
        this.identityIdFrom(document) === identityId,
      {
        mode: 'fallback',
        operation: 'IdentityMetadataIndex.findByIdentityId',
      },
    );

    return documents
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is IdentityMetadataRecord =>
          document !== undefined,
      );
  }

  private async findStoredRecordsByHandle(
    handle: string,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) =>
        document.deleted !== true &&
        Boolean(this.stringValue(document, 'cid')) &&
        this.stringValue(document, 'handle') === handle,
      {
        mode: 'fallback',
        operation: 'OrbitDBIdentityMetadataIndex.findStoredRecordsByHandle',
      },
    );

    return documents
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is IdentityMetadataRecord =>
          document !== undefined,
      );
  }

  private async findStoredRecordsByNetworkId(
    networkId: string,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) =>
        document.deleted !== true &&
        Boolean(this.stringValue(document, 'cid')) &&
        (this.networkIdsFrom(document)?.includes(networkId) ||
          this.stringValue(document, 'networkId') === networkId),
      {
        mode: 'fallback',
        operation: 'IdentityMetadataIndex.findByNetworkId',
      },
    );

    return documents
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is IdentityMetadataRecord =>
          document !== undefined,
      );
  }

  private findCachedRecordsByHandle(handle: string): IdentityMetadataRecord[] {
    return this.registry
      .findCachedHeadsByPrefix('identity:')
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is IdentityMetadataRecord =>
          document !== undefined && document.handle === handle,
      );
  }

  private networkIdsFor(document: IdentityMetadataRecord): string[] {
    return [
      ...new Set([
        ...(document.networkIds || []),
        ...(document.networkId ? [document.networkId] : []),
      ]),
    ];
  }

  private async putHeads(document: IdentityMetadataRecord): Promise<void> {
    const networkIds = this.networkIdsFor(document);
    const storageDocument = this.toStorageDocument(document);

    await this.registry.putHead(
      this.identityHeadKey(document.identityId),
      storageDocument,
      networkIds,
    );

    if (document.handle) {
      await this.registry.putHead(
        this.handleHeadKey(document.handle),
        storageDocument,
        networkIds,
      );
    }
  }

  private async putTombstoneHeads(
    document: IdentityMetadataRecord,
  ): Promise<void> {
    const tombstone = this.toStorageDocument(document, true);
    const networkIds = this.networkIdsFor(document);

    await this.registry.putHead(
      this.identityHeadKey(document.identityId),
      tombstone,
      networkIds,
    );

    if (document.handle) {
      await this.registry.putHead(
        this.handleHeadKey(document.handle),
        tombstone,
        networkIds,
      );
    }
  }

  public findAll(): Promise<IdentityMetadataRecord[]> {
    return Promise.resolve(
      this.sortByFreshness(
        this.registry
          .findCachedHeadsByPrefix('identity:')
          .map((document) => this.toRecord(document))
          .filter(
            (document): document is IdentityMetadataRecord =>
              document !== undefined,
          ),
      ),
    );
  }

  public async findByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityMetadataRecord[]> {
    const head = await this.findHead(this.handleHeadKey(handle.valueOf()));

    if (head) {
      this.repairHandleHeadInBackground(handle.valueOf(), head);

      return [head];
    }

    const cachedLatest = this.latestRecordFrom(
      this.findCachedRecordsByHandle(handle.valueOf()),
    );

    if (this.isHttpRequest()) {
      if (cachedLatest) {
        this.repairHeadInBackground(this.handleHeadKey(handle.valueOf()), () =>
          this.readRepairHead(head, cachedLatest),
        );

        return [cachedLatest];
      }

      return [];
    }

    const latest = this.latestRecordFrom([
      ...(cachedLatest ? [cachedLatest] : []),
      ...(await this.findStoredRecordsByHandle(handle.valueOf())),
    ]);

    if (!latest) {
      return [];
    }

    await this.readRepairHead(head, latest);

    return [latest];
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityMetadataRecord[]> {
    const head = await this.findHead(
      this.identityHeadKey(identityId.valueOf()),
    );

    if (head) {
      this.repairIdentityHeadInBackground(identityId.valueOf(), head);

      return [head];
    }

    if (this.isHttpRequest()) {
      return [];
    }

    const latest = this.latestRecordFrom([
      ...(await this.findStoredRecordsByIdentityId(identityId.valueOf())),
    ]);

    if (!latest) {
      return [];
    }

    await this.readRepairHead(head, latest);

    return [latest];
  }

  public async findLatestByNetworkId(
    networkId: NetworkId,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = this.sortByFreshness([
      ...this.registry
        .findCachedHeadsByPrefix('identity:')
        .map((document) => this.toRecord(document))
        .filter(
          (document): document is IdentityMetadataRecord =>
            document !== undefined &&
            (document.networkIds?.includes(networkId.valueOf()) ||
              document.networkId === networkId.valueOf()),
        ),
      ...(await this.findStoredRecordsByNetworkId(networkId.valueOf())),
    ]);
    const latestDocuments = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      if (!latestDocuments.has(document.identityId)) {
        latestDocuments.set(document.identityId, document);
        await this.readRepairHead(
          await this.findHead(this.identityHeadKey(document.identityId)),
          document,
        );
      }
    }

    return [...latestDocuments.values()];
  }

  public async save(
    identity: Identity,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const primitives = identity.toPrimitives();
    const record: IdentityMetadataRecord = {
      cid: externalIdentifier.valueOf(),
      handle: primitives.profile.handle,
      identity,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      receivedAt: Date.now(),
      version: primitives.version,
    };

    await this.registry.putDocument(
      'identities',
      this.toStorageDocument(record),
    );
    await this.putHeads(record);
  }

  public async deleteByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const documents = (await this.findAll()).filter(
      (document) => document.cid === externalIdentifier.valueOf(),
    );

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument(
          'identities',
          this.toStorageDocument(document, true),
        ),
      ),
    );
    await Promise.all(
      documents.map((document) => this.putTombstoneHeads(document)),
    );
  }
}
