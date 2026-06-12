import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';

import { OrbitDBContentReplicaClaimDocument } from '../documents/OrbitDBContentReplicaClaimDocument';

export default class OrbitDBContentReplicaClaimMapper {
  public toDocument(
    claim: ContentReplicaClaim,
  ): OrbitDBContentReplicaClaimDocument {
    const primitives = claim.toPrimitives();

    return {
      cid: primitives.cid,
      claimedAt: primitives.claimedAt,
      id: `${primitives.cid}:${primitives.networkId}:${primitives.nodeId}`,
      kind: 'content_replica_claim',
      networkId: primitives.networkId,
      nodeId: primitives.nodeId,
    };
  }

  public toDomain(
    document: OrbitDBContentReplicaClaimDocument,
  ): ContentReplicaClaim {
    return ContentReplicaClaim.fromPrimitives({
      cid: document.cid,
      claimedAt: document.claimedAt,
      networkId: document.networkId,
      nodeId: document.nodeId,
    });
  }
}
