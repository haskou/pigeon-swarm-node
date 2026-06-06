import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { GroupConversationMustHaveTwoParticipantsError } from './errors/GroupConversationMustHaveAtLeastTwoParticipantsError';
import { ConversationWasCreatedEvent } from './events/ConversationWasCreatedEvent';
import { Message } from './Message';
import { MessageFactory } from './MessageFactory';
import { ConversationId } from './value-objects/ConversationId';
import { ConversationType } from './value-objects/ConversationType';
import { GroupConversationName } from './value-objects/GroupConversationName';

export class GroupConversation extends Conversation {
  private static hasAtLeastTwoDifferentParticipants(
    participants: IdentityId[],
  ): boolean {
    const uniqueParticipants = participants.filter(
      (participant, index) =>
        participants.findIndex((candidate) =>
          candidate.isEqual(participant),
        ) === index,
    );

    return uniqueParticipants.length >= 2;
  }

  public static create(
    name: GroupConversationName,
    participants: IdentityId[],
    networkId: NetworkId,
  ): GroupConversation {
    const conversation = new GroupConversation(
      ConversationId.group(),
      networkId,
      name,
      participants,
    );

    conversation.record(
      new ConversationWasCreatedEvent(conversation.toPrimitives().id, {
        name: conversation.toPrimitives().name,
        networkId: conversation.toPrimitives().networkId,
        participantIds: conversation.toPrimitives().participantIds,
        type: conversation.toPrimitives().type,
      }),
    );

    return conversation;
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): GroupConversation {
    return new GroupConversation(
      new ConversationId(primitives.id),
      new NetworkId(primitives.networkId),
      new GroupConversationName(primitives.name ?? ''),
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
    name: GroupConversationName,
    participants: IdentityId[],
    messages: Message[] = [],
  ) {
    super(id, networkId, ConversationType.GROUP, participants, name, messages);

    assert(
      GroupConversation.hasAtLeastTwoDifferentParticipants(participants),
      new GroupConversationMustHaveTwoParticipantsError(),
    );
  }
}
