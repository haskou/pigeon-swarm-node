import { ConversationMustHaveTwoDifferentParticipantsError } from '@app/contexts/conversations/domain/errors/ConversationMustHaveTwoDifferentParticipantsError';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { UUID } from '@haskou/value-objects';

import { ConversationMother } from '../../../mothers/ConversationMother';

describe('OneToOneConversation', () => {
  let firstParticipant: IdentityId;
  let networkId: NetworkId;
  let secondParticipant: IdentityId;

  beforeEach(async () => {
    firstParticipant = await ConversationMother.generateIdentityId();
    networkId = new NetworkId(UUID.generate().toString());
    secondParticipant = await ConversationMother.generateIdentityId();
  });

  it('should create a deterministic id from the sorted participant ids', () => {
    const conversation = new ConversationMother(
      firstParticipant,
      secondParticipant,
    )
      .withNetworkId(networkId)
      .build();
    const reversed = OneToOneConversation.create(
      secondParticipant,
      firstParticipant,
      networkId,
    );

    expect(conversation.toPrimitives().id).toBe(reversed.toPrimitives().id);
    expect(conversation.toPrimitives().participantIds).toEqual([
      firstParticipant.valueOf(),
      secondParticipant.valueOf(),
    ]);
  });

  it('should restore a one-to-one conversation from primitives', () => {
    const conversation = OneToOneConversation.create(
      firstParticipant,
      secondParticipant,
      networkId,
    );

    const restored = OneToOneConversation.fromPrimitives(
      conversation.toPrimitives(),
    );

    expect(restored.toPrimitives()).toEqual(conversation.toPrimitives());
  });

  it('should reject conversations with the same participant twice', () => {
    expect(() =>
      OneToOneConversation.create(firstParticipant, firstParticipant, networkId),
    ).toThrow(ConversationMustHaveTwoDifferentParticipantsError);
  });
});
