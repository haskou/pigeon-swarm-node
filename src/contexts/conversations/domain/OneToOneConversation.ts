import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { Message } from './entities/messages/Message';
import { MessageFactory } from './entities/messages/MessageFactory';
import { ConversationMustHaveTwoDifferentParticipantsError } from './errors/ConversationMustHaveTwoDifferentParticipantsError';
import { ConversationAdmins } from './value-objects/ConversationAdmins';
import { ConversationId } from './value-objects/ConversationId';
import { ConversationType } from './value-objects/ConversationType';

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
      ConversationType.ONE_TO_ONE,
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      undefined,
      primitives.messages.map((message) =>
        MessageFactory.fromPrimitives(message),
      ),
      primitives.creatorId ? new IdentityId(primitives.creatorId) : undefined,
    );
  }

  constructor(
    id: ConversationId,
    networkId: NetworkId,
    type: ConversationType,
    participants: IdentityId[],
    name: undefined = undefined,
    messages: Message[] = [],
    creatorId: IdentityId | undefined = undefined,
  ) {
    super(
      id,
      networkId,
      type,
      participants,
      name,
      messages,
      new ConversationAdmins(creatorId),
    );

    assert(
      participants.length === 2 && participants[0].isNotEqual(participants[1]),
      new ConversationMustHaveTwoDifferentParticipantsError(),
    );
  }
}
