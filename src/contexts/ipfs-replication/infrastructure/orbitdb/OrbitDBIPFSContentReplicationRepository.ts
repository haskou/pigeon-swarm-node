import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import { IPFSContentReplicationRepository as Repo } from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicationRepository';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBIPFSContentReplicationDocument } from './documents/OrbitDBIPFSContentReplicationDocument';
import OrbitDBIPFSContentReplicationMapper from './mappers/OrbitDBIPFSContentReplicationMapper';

export default class OrbitDBIPFSContentReplicationRepository implements Repo {
  private readonly mapper: OrbitDBIPFSContentReplicationMapper;

  private readonly registry: OrbitDBReplicatedStateRegistry;

  constructor(
    registry?: OrbitDBReplicatedStateRegistry,
    mapper?: OrbitDBIPFSContentReplicationMapper,
  ) {
    this.registry = registry || OrbitDBReplicatedStateRegistry.shared();
    this.mapper = mapper || new OrbitDBIPFSContentReplicationMapper();
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] | undefined {
    const value = document[attribute];

    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.every((item) => typeof item === 'string') ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private isCompleteDocument(
    document: Partial<OrbitDBIPFSContentReplicationDocument>,
  ): document is OrbitDBIPFSContentReplicationDocument {
    return [
      document.cid,
      document.context,
      document.createdAt,
      document.id,
      document.networkIds,
      document.priority,
      document.sizeBytes,
      document.updatedAt,
    ].every((value) => value !== undefined);
  }

  private documentFromRecord(
    record: Record<string, unknown>,
  ): OrbitDBIPFSContentReplicationDocument | undefined {
    const cid = this.stringValue(record, 'cid');
    const contentType = this.stringValue(record, 'contentType');
    const context = this.stringValue(record, 'context');
    const createdAt = this.numberValue(record, 'createdAt');
    const filename = this.stringValue(record, 'filename');
    const id = this.stringValue(record, 'id') || cid;
    const networkIds = this.stringArrayValue(record, 'networkIds');
    const ownerIdentityId = this.stringValue(record, 'ownerIdentityId');
    const priority = this.stringValue(record, 'priority');
    const sizeBytes = this.numberValue(record, 'sizeBytes');
    const updatedAt = this.numberValue(record, 'updatedAt');

    const document: Partial<OrbitDBIPFSContentReplicationDocument> = {
      cid,
      contentType,
      context,
      createdAt,
      filename,
      id,
      networkIds,
      ownerIdentityId,
      priority: priority as OrbitDBIPFSContentReplicationDocument['priority'],
      sizeBytes,
      updatedAt,
    };

    return this.isCompleteDocument(document) ? document : undefined;
  }

  private deduplicateDocuments(
    documents: OrbitDBIPFSContentReplicationDocument[],
  ): OrbitDBIPFSContentReplicationDocument[] {
    const deduplicated = new Map<
      string,
      OrbitDBIPFSContentReplicationDocument
    >();

    for (const document of documents) {
      const current = deduplicated.get(document.cid);

      if (!current || current.updatedAt < document.updatedAt) {
        deduplicated.set(document.cid, document);
      }
    }

    return [...deduplicated.values()];
  }

  private async findDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<OrbitDBIPFSContentReplicationDocument[]> {
    const documents = await this.registry.queryDocuments(
      'ipfsReplication',
      matcher,
    );

    return documents
      .map((document) => this.documentFromRecord(document))
      .filter(
        (document): document is OrbitDBIPFSContentReplicationDocument =>
          document !== undefined,
      );
  }

  public async findAll(): Promise<IPFSContentReplication[]> {
    const documents = await this.findDocuments(() => true);

    return this.deduplicateDocuments(documents)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((document) => this.mapper.toDomain(document));
  }

  public async findByCid(
    cid: IPFSId,
  ): Promise<IPFSContentReplication | undefined> {
    const cidValue = cid.valueOf();
    const documents = await this.findDocuments(
      (candidate) =>
        this.stringValue(candidate, 'cid') === cidValue ||
        this.stringValue(candidate, 'id') === cidValue,
    );
    const [document] = this.deduplicateDocuments(documents).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async save(content: IPFSContentReplication): Promise<void> {
    await this.registry.putDocument('ipfsReplication', {
      ...this.mapper.toDocument(content),
    });
  }
}
