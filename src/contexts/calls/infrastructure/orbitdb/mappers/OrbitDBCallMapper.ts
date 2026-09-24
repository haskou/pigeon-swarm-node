import { Call } from '@app/contexts/calls/domain/Call';

import { OrbitDBCallDocument } from '../documents/OrbitDBCallDocument';

export default class OrbitDBCallMapper {
  public toDocument(call: Call): OrbitDBCallDocument {
    const primitives = call.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      ...(call.getScope().isConversation()
        ? {
            creatorIdentityId: primitives.creatorIdentityId,
            endedByIdentityId: primitives.endedByIdentityId,
          }
        : {}),
      endedAt: primitives.endedAt,
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: call.getScope().isCommunityChannel()
        ? []
        : primitives.participantIds,
      participants: call.getScope().isCommunityChannel()
        ? []
        : primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
      ...(primitives.sessionEpoch === undefined
        ? {}
        : { sessionEpoch: primitives.sessionEpoch }),
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
      participantIds:
        document.scope.type === 'community_channel'
          ? []
          : document.participantIds,
      participants:
        document.scope.type === 'community_channel'
          ? []
          : document.participants,
      scope: document.scope,
      status: document.status,
      ...(document.sessionEpoch === undefined
        ? {}
        : { sessionEpoch: document.sessionEpoch }),
    });
  }

  public toDomainList(documents: OrbitDBCallDocument[]): Call[] {
    return documents.map((document) => this.toDomain(document));
  }
}
