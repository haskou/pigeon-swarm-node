import { IPFSContentReplicaClaim } from '@app/contexts/ipfs-replication/domain/IPFSContentReplicaClaim';
import IPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicaClaimRepository';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBIPFSContentReplicaClaimDocument } from './documents/OrbitDBIPFSContentReplicaClaimDocument';
import OrbitDBIPFSContentReplicaClaimMapper from './mappers/OrbitDBIPFSContentReplicaClaimMapper';

// eslint-disable-next-line max-len
export default class OrbitDBIPFSContentReplicaClaimRepository extends IPFSContentReplicaClaimRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBIPFSContentReplicaClaimMapper,
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
  ): document is OrbitDBIPFSContentReplicaClaimDocument {
    return (
      this.stringValue(document, 'cid') !== undefined &&
      this.numberValue(document, 'claimedAt') !== undefined &&
      this.stringValue(document, 'id') !== undefined &&
      this.stringValue(document, 'kind') === 'ipfs_content_replica_claim' &&
      this.stringValue(document, 'networkId') !== undefined &&
      this.stringValue(document, 'nodeId') !== undefined
    );
  }

  private async findDocuments(
    matcher: (document: OrbitDBIPFSContentReplicaClaimDocument) => boolean,
  ): Promise<OrbitDBIPFSContentReplicaClaimDocument[]> {
    const documents = await this.registry.queryDocuments(
      'ipfsReplication',
      (candidate) =>
        this.isReplicaClaimDocument(candidate) && matcher(candidate),
    );

    return documents.filter((document) =>
      this.isReplicaClaimDocument(document),
    );
  }

  public async findByCids(cids: IPFSId[]): Promise<IPFSContentReplicaClaim[]> {
    if (cids.length === 0) {
      return [];
    }

    const cidValues = cids.map((cid) => cid.valueOf());
    const documents = await this.findDocuments((document) =>
      cidValues.includes(document.cid),
    );

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async save(claim: IPFSContentReplicaClaim): Promise<void> {
    await this.registry.putDocument(
      'ipfsReplication',
      this.mapper.toDocument(claim),
    );
  }
}
