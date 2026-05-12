import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { ConversationMustHaveTwoDifferentParticipantsError } from './errors/ConversationMustHaveTwoDifferentParticipantsError';
import { ConversationWasCreatedEvent } from './events/ConversationWasCreatedEvent';
import { Message } from './Message';
import { MessageFactory } from './MessageFactory';
import { ConversationId } from './value-objects/ConversationId';

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
      [firstParticipant, secondParticipant],
    );

    conversation.record(
      new ConversationWasCreatedEvent(conversation.toPrimitives().id, {
        networkId: conversation.toPrimitives().networkId,
        participantIds: conversation.toPrimitives().participantIds,
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
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.messages.map((message) =>
        MessageFactory.fromPrimitives(message),
      ),
    );
  }

  constructor(
    id: ConversationId,
    networkId: NetworkId,
    participants: IdentityId[],
    messages: Message[] = [],
  ) {
    super(id, networkId, participants, messages);

    assert(
      participants.length === 2 && participants[0].isNotEqual(participants[1]),
      new ConversationMustHaveTwoDifferentParticipantsError(),
    );
  }
}
