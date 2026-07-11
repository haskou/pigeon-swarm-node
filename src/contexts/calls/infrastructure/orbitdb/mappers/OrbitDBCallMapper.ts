import { Call } from '@app/contexts/calls/domain/Call';

import { OrbitDBCallDocument } from '../documents/OrbitDBCallDocument';

export default class OrbitDBCallMapper {
  public toDocument(call: Call): OrbitDBCallDocument {
    const primitives = call.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      endedByIdentityId: primitives.endedByIdentityId,
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      participants: primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
      updatedAt: Date.now(),
    };
  }

  public toDomain(document: OrbitDBCallDocument): Call {
    return Call.fromPrimitives({
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      endedAt: document.endedAt,
      endedByIdentityId: document.endedByIdentityId,
      id: document.id,
      networkId: document.networkId,
      participantIds: document.participantIds,
      participants: document.participants,
      scope: document.scope,
      status: document.status,
    });
  }

  public toDomainList(documents: OrbitDBCallDocument[]): Call[] {
    return documents.map((document) => this.toDomain(document));
  }
}
