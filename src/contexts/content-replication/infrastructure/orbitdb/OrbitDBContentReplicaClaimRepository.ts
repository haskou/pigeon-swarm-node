import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';
import ContentReplicaClaimRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicaClaimRepository';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBContentReplicaClaimDocument } from './documents/OrbitDBContentReplicaClaimDocument';
import OrbitDBContentReplicaClaimMapper from './mappers/OrbitDBContentReplicaClaimMapper';

export default class OrbitDBContentReplicaClaimRepository extends ContentReplicaClaimRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBContentReplicaClaimMapper,
  ) {
    super();
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private isReplicaClaimDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBContentReplicaClaimDocument {
    return (
      this.stringValue(document, 'cid') !== undefined &&
      this.numberValue(document, 'claimedAt') !== undefined &&
      this.stringValue(document, 'id') !== undefined &&
      this.stringValue(document, 'kind') === 'content_replica_claim' &&
      this.stringValue(document, 'networkId') !== undefined &&
      this.stringValue(document, 'nodeId') !== undefined
    );
  }

  private headKey(document: OrbitDBContentReplicaClaimDocument): string {
    return `content-replica-claim:${document.cid}:${document.networkId}:${document.nodeId}`;
  }

  private cidIndexPrefix(cid: ContentId): string {
    return `content-replica-claim:${cid.valueOf()}:`;
  }

  public async findByCids(cids: ContentId[]): Promise<ContentReplicaClaim[]> {
    if (cids.length === 0) {
      return [];
    }

    const documents = cids.flatMap((cid) =>
      this.registry
        .findCachedHeadsByPrefix(this.cidIndexPrefix(cid))
        .filter((document): document is OrbitDBContentReplicaClaimDocument =>
          this.isReplicaClaimDocument(document),
        ),
    );

    return Promise.resolve(
      documents.map((document) => this.mapper.toDomain(document)),
    );
  }

  public async save(claim: ContentReplicaClaim): Promise<void> {
    const document = this.mapper.toDocument(claim);

    await this.registry.putDocument('contentReplication', document, [
      document.networkId,
    ]);
    await this.registry.putHead(this.headKey(document), document, [
      document.networkId,
    ]);
  }
}
