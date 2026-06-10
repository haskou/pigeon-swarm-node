import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';
import ContentReplicaClaimRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicaClaimRepository';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBContentReplicaClaimDocument } from './documents/OrbitDBContentReplicaClaimDocument';
import OrbitDBContentReplicaClaimMapper from './mappers/OrbitDBContentReplicaClaimMapper';

// eslint-disable-next-line max-len
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

  private async findDocuments(
    matcher: (document: OrbitDBContentReplicaClaimDocument) => boolean,
  ): Promise<OrbitDBContentReplicaClaimDocument[]> {
    const documents = await this.registry.queryDocuments(
      'contentReplication',
      (candidate) =>
        this.isReplicaClaimDocument(candidate) && matcher(candidate),
    );

    return documents.filter((document) =>
      this.isReplicaClaimDocument(document),
    );
  }

  public async findByCids(cids: IPFSId[]): Promise<ContentReplicaClaim[]> {
    if (cids.length === 0) {
      return [];
    }

    const cidValues = cids.map((cid) => cid.valueOf());
    const documents = await this.findDocuments((document) =>
      cidValues.includes(document.cid),
    );

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async save(claim: ContentReplicaClaim): Promise<void> {
    await this.registry.putDocument(
      'contentReplication',
      this.mapper.toDocument(claim),
    );
  }
}
