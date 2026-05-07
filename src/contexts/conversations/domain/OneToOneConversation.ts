import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { Conversation, ConversationPrimitives } from './Conversation';
import { ConversationMustHaveTwoDifferentParticipantsError } from './errors/ConversationMustHaveTwoDifferentParticipantsError';
import { MessageEvent } from './MessageEvent';
import { MessageEventFactory } from './MessageEventFactory';
import { ConversationId } from './value-objects/ConversationId';

export class OneToOneConversation extends Conversation {
  public static create(
    firstParticipant: IdentityId,
    secondParticipant: IdentityId,
  ): OneToOneConversation {
    return new OneToOneConversation(
      ConversationId.deterministic(
        firstParticipant.valueOf(),
        secondParticipant.valueOf(),
      ),
      [firstParticipant, secondParticipant],
    );
  }

  public static fromPrimitives(
    primitives: ConversationPrimitives,
  ): OneToOneConversation {
    return new OneToOneConversation(
      new ConversationId(primitives.id),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.events.map((event) =>
        MessageEventFactory.fromPrimitives(event),
      ),
    );
  }

  constructor(
    id: ConversationId,
    participants: IdentityId[],
    events: MessageEvent[] = [],
  ) {
    super(id, participants, events);

    assert(
      participants.length === 2 &&
        participants[0].valueOf() !== participants[1].valueOf(),
      new ConversationMustHaveTwoDifferentParticipantsError(),
    );
  }
}
