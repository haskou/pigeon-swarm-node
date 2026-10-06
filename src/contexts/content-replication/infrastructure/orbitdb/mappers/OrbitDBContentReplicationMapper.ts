import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { OrbitDBContentReplicationDocument } from '../documents/OrbitDBContentReplicationDocument';
import { OrbitDBContentReplicationTombstone } from '../documents/OrbitDBContentReplicationTombstone';

export default class OrbitDBContentReplicationMapper {
  public toDocument(
    content: ContentReplication,
  ): OrbitDBContentReplicationDocument {
    const primitives = content.toPrimitives();

    return {
      cid: primitives.cid,
      context: primitives.context,
      id: content.getId(),
      networkId: primitives.networkId,
      ownerIdentityId: primitives.ownerIdentityId,
      scopeType: 'content_replication',
      sizeBytes: primitives.sizeBytes,
    };
  }

  public toDomain(
    document: OrbitDBContentReplicationDocument,
  ): ContentReplication {
    return ContentReplication.fromPrimitives({
      cid: document.cid,
      context: document.context,
      networkId: document.networkId,
      ownerIdentityId: document.ownerIdentityId,
      sizeBytes: document.sizeBytes,
    });
  }

  public toTombstone(
    ownerIdentityId: IdentityId,
    networkId: NetworkId,
    cid: ContentId,
  ): OrbitDBContentReplicationTombstone {
    return {
      cid: cid.valueOf(),
      id: ContentReplication.idOf(networkId.valueOf(), cid.valueOf()),
      networkId: networkId.valueOf(),
      ownerIdentityId: ownerIdentityId.valueOf(),
      removed: true,
      scopeType: 'content_replication',
    };
  }
}
