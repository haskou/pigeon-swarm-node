import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { ConversationMustHaveTwoDifferentParticipantsError } from './errors/ConversationMustHaveTwoDifferentParticipantsError';
import { ConversationId } from './value-objects/ConversationId';

/**
 * A 1:1 conversation is immutable: its two participants are fixed by the
 * genesis record signed by the creator, and no operation can change them.
 */
export class OneToOneConversation extends Conversation {
  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): OneToOneConversation {
    return new OneToOneConversation(
      new ConversationId(primitives.id),
      new NetworkId(primitives.networkId),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.creatorId ? new IdentityId(primitives.creatorId) : undefined,
    );
  }

  constructor(
    id: ConversationId,
    networkId: NetworkId,
    participants: IdentityId[],
    creatorId: IdentityId | undefined = undefined,
  ) {
    super(id, networkId, participants, creatorId);

    assert(
      participants.length === 2 && participants[0].isNotEqual(participants[1]),
      new ConversationMustHaveTwoDifferentParticipantsError(),
    );
  }
}
