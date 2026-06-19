import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { Message } from './entities/messages/Message';
import { MessageFactory } from './entities/messages/MessageFactory';
import { ConversationMustHaveTwoDifferentParticipantsError } from './errors/ConversationMustHaveTwoDifferentParticipantsError';
import { ConversationWasCreatedEvent } from './events/ConversationWasCreatedEvent';
import { ConversationId } from './value-objects/ConversationId';
import { ConversationType } from './value-objects/ConversationType';

export class OneToOneConversation extends Conversation {
  public static create(
    firstParticipant: IdentityId,
    secondParticipant: IdentityId,
    networkId: NetworkId,
  ): OneToOneConversation {
    const conversation = new OneToOneConversation(
      ConversationId.deterministic(
        firstParticipant,
        secondParticipant,
        networkId,
      ),
      networkId,
      ConversationType.ONE_TO_ONE,
      [firstParticipant, secondParticipant],
    );

    conversation.record(
      new ConversationWasCreatedEvent(conversation.toPrimitives().id, {
        networkId: conversation.toPrimitives().networkId,
        participantIds: conversation.toPrimitives().participantIds,
        type: conversation.toPrimitives().type,
      }),
    );

    return conversation;
  }

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
    );
  }

  constructor(
    id: ConversationId,
    networkId: NetworkId,
    type: ConversationType,
    participants: IdentityId[],
    name: undefined = undefined,
    messages: Message[] = [],
  ) {
    super(id, networkId, type, participants, name, messages);

    assert(
      participants.length === 2 && participants[0].isNotEqual(participants[1]),
      new ConversationMustHaveTwoDifferentParticipantsError(),
    );
  }
}
