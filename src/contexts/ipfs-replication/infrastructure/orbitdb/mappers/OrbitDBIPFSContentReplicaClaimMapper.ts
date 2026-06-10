import { IPFSContentReplicaClaim } from '@app/contexts/ipfs-replication/domain/IPFSContentReplicaClaim';

import { OrbitDBIPFSContentReplicaClaimDocument } from '../documents/OrbitDBIPFSContentReplicaClaimDocument';

export default class OrbitDBIPFSContentReplicaClaimMapper {
  public toDocument(
    claim: IPFSContentReplicaClaim,
  ): OrbitDBIPFSContentReplicaClaimDocument {
    const primitives = claim.toPrimitives();

    return {
      cid: primitives.cid,
      claimedAt: primitives.claimedAt,
      id: `${primitives.cid}:${primitives.networkId}:${primitives.nodeId}`,
      kind: 'ipfs_content_replica_claim',
      networkId: primitives.networkId,
      nodeId: primitives.nodeId,
    };
  }

  public toDomain(
    document: OrbitDBIPFSContentReplicaClaimDocument,
  ): IPFSContentReplicaClaim {
    return IPFSContentReplicaClaim.fromPrimitives({
      cid: document.cid,
      claimedAt: document.claimedAt,
      networkId: document.networkId,
      nodeId: document.nodeId,
    });
  }
}
