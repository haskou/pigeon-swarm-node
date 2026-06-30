import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import OrbitDBDocumentDeduplicator from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDocumentDeduplicator';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBContentReplicationDocument } from './documents/OrbitDBContentReplicationDocument';
import OrbitDBContentReplicationMapper from './mappers/OrbitDBContentReplicationMapper';

export default class OrbitDBContentReplicationRepository extends ContentReplicationRepository {
  private readonly documentDeduplicator: OrbitDBDocumentDeduplicator<OrbitDBContentReplicationDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBContentReplicationMapper,
  ) {
    super();
    this.documentDeduplicator =
      new OrbitDBDocumentDeduplicator<OrbitDBContentReplicationDocument>({
        recordId: (record) => record.cid,
        shouldReplace: (current, candidate) =>
          current.updatedAt < candidate.updatedAt,
      });
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
    document: Partial<OrbitDBContentReplicationDocument>,
  ): document is OrbitDBContentReplicationDocument {
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
  ): OrbitDBContentReplicationDocument | undefined {
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

    const document: Partial<OrbitDBContentReplicationDocument> = {
      cid,
      contentType,
      context,
      createdAt,
      filename,
      id,
      networkIds,
      ownerIdentityId,
      priority: priority as OrbitDBContentReplicationDocument['priority'],
      sizeBytes,
      updatedAt,
    };

    return this.isCompleteDocument(document) ? document : undefined;
  }

  private headKey(cid: string): string {
    return `content-replication:${cid}`;
  }

  public findAll(): Promise<ContentReplication[]> {
    const documents = this.registry
      .findCachedHeadsByPrefix('content-replication:')
      .map((document) => this.documentFromRecord(document))
      .filter(
        (document): document is OrbitDBContentReplicationDocument =>
          document !== undefined,
      );

    return Promise.resolve(
      this.documentDeduplicator
        .deduplicate(documents)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((document) => this.mapper.toDomain(document)),
    );
  }

  public async findByCid(
    cid: ContentId,
  ): Promise<ContentReplication | undefined> {
    const cidValue = cid.valueOf();
    const head = this.documentFromRecord(
      (await this.registry.findHead(this.headKey(cidValue))) || {},
    );

    if (head) {
      return this.mapper.toDomain(head);
    }

    return undefined;
  }

  public async save(content: ContentReplication): Promise<void> {
    const document = this.mapper.toDocument(content);

    await this.registry.putDocument('contentReplication', {
      ...document,
    });
    await this.registry.putHead(
      this.headKey(document.cid),
      { ...document },
      document.networkIds,
    );
  }
}
