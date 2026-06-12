import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';

import { OrbitDBContentReplicationDocument } from '../documents/OrbitDBContentReplicationDocument';

export default class OrbitDBContentReplicationMapper {
  public toDocument(
    content: ContentReplication,
  ): OrbitDBContentReplicationDocument {
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
    document: OrbitDBContentReplicationDocument,
  ): ContentReplication {
    return ContentReplication.fromPrimitives({
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
