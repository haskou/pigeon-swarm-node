import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { ConversationMustHaveTwoDifferentParticipantsError } from './errors/ConversationMustHaveTwoDifferentParticipantsError';
import { Message } from './Message';
import { MessageFactory } from './MessageFactory';
import { ConversationId } from './value-objects/ConversationId';

export class OneToOneConversation extends Conversation {
  public static create(
    firstParticipant: IdentityId,
    secondParticipant: IdentityId,
  ): OneToOneConversation {
    return new OneToOneConversation(
      ConversationId.deterministic(firstParticipant, secondParticipant),
      [firstParticipant, secondParticipant],
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): OneToOneConversation {
    return new OneToOneConversation(
      new ConversationId(primitives.id),
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
    participants: IdentityId[],
    messages: Message[] = [],
  ) {
    super(id, participants, messages);

    assert(
      participants.length === 2 && participants[0].isNotEqual(participants[1]),
      new ConversationMustHaveTwoDifferentParticipantsError(),
    );
  }
}
