import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';

import { OrbitDBIPFSContentReplicationDocument } from '../documents/OrbitDBIPFSContentReplicationDocument';

export default class OrbitDBIPFSContentReplicationMapper {
  public toDocument(
    content: IPFSContentReplication,
  ): OrbitDBIPFSContentReplicationDocument {
    const primitives = content.toPrimitives();

    return {
      cid: primitives.cid,
      contentType: primitives.contentType,
      context: primitives.context,
      createdAt: primitives.createdAt,
      filename: primitives.filename,
      id: primitives.cid,
      networkIds: primitives.networkIds,
      ownerIdentityId: primitives.ownerIdentityId,
      priority: primitives.priority,
      sizeBytes: primitives.sizeBytes,
      updatedAt: primitives.updatedAt,
    };
  }

  public toDomain(
    document: OrbitDBIPFSContentReplicationDocument,
  ): IPFSContentReplication {
    return IPFSContentReplication.fromPrimitives({
      cid: document.cid,
      contentType: document.contentType,
      context: document.context,
      createdAt: document.createdAt,
      filename: document.filename,
      networkIds: document.networkIds,
      ownerIdentityId: document.ownerIdentityId,
      priority: document.priority,
      sizeBytes: document.sizeBytes,
      updatedAt: document.updatedAt,
    });
  }
}
