import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBContentReplicationDocument } from './documents/OrbitDBContentReplicationDocument';
import OrbitDBContentReplicationMapper from './mappers/OrbitDBContentReplicationMapper';

/**
 * Registrations live in the gated `contentReplication` collection, one record
 * per (network, cid). Reads go through the registry's admission, so a record
 * that the policy refuses is never listed, whoever wrote it.
 */
export default class OrbitDBContentReplicationRepository extends ContentReplicationRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBContentReplicationMapper,
  ) {
    super();
  }

  private async liveDocuments(
    cid?: string,
  ): Promise<OrbitDBContentReplicationDocument[]> {
    const records = await this.registry.queryDocuments(
      'contentReplication',
      (record) =>
        record.removed !== true &&
        record.scopeType === 'content_replication' &&
        (cid === undefined || record.cid === cid),
    );

    return records.map(
      (record) => record as unknown as OrbitDBContentReplicationDocument,
    );
  }

  private toDomain(
    documents: OrbitDBContentReplicationDocument[],
  ): ContentReplication[] {
    return documents.flatMap((document) => {
      try {
        return [this.mapper.toDomain(document)];
      } catch {
        return [];
      }
    });
  }

  private async write(
    id: string,
    networkId: NetworkId,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);
    const stored = await this.registry.queryUnadmittedDocuments(
      'contentReplication',
      (record) => record.id === id,
      [networkId.valueOf()],
    );

    PublicMutationRecord.assertNotStale(stored, document);
    await this.registry.putDocument('contentReplication', document);
  }

  public delete(
    ownerIdentityId: IdentityId,
    networkId: NetworkId,
    cid: ContentId,
    proof: PublicMutationProof,
  ): Promise<void> {
    return this.write(
      ContentReplication.idOf(networkId.valueOf(), cid.valueOf()),
      networkId,
      { ...this.mapper.toTombstone(ownerIdentityId, networkId, cid) },
      proof,
    );
  }

  public async findAll(): Promise<ContentReplication[]> {
    return this.toDomain(await this.liveDocuments());
  }

  public async findByCid(cid: ContentId): Promise<ContentReplication[]> {
    return this.toDomain(await this.liveDocuments(cid.valueOf()));
  }

  public save(
    content: ContentReplication,
    proof: PublicMutationProof,
  ): Promise<void> {
    return this.write(
      content.getId(),
      content.getNetworkId(),
      { ...this.mapper.toDocument(content) },
      proof,
    );
  }
}
