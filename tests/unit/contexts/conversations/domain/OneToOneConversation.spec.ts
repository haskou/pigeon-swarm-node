import { ConversationMustHaveTwoDifferentParticipantsError } from '@app/contexts/conversations/domain/errors/ConversationMustHaveTwoDifferentParticipantsError';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationType } from '@app/contexts/conversations/domain/value-objects/ConversationType';
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

  it('should keep the deterministic id regardless of the participant order', () => {
    const conversation = new ConversationMother(
      firstParticipant,
      secondParticipant,
    )
      .withNetworkId(networkId)
      .build();
    const reversed = new ConversationMother(secondParticipant, firstParticipant)
      .withNetworkId(networkId)
      .build();

    expect(conversation.toPrimitives().id).toBe(reversed.toPrimitives().id);
    expect(conversation.toPrimitives().participantIds).toEqual(
      reversed.toPrimitives().participantIds,
    );
  });

  it('should restore a one-to-one conversation from primitives', () => {
    const conversation = new ConversationMother(
      firstParticipant,
      secondParticipant,
    )
      .withNetworkId(networkId)
      .build();

    const restored = OneToOneConversation.fromPrimitives(
      conversation.toPrimitives(),
    );

    expect(restored.toPrimitives()).toEqual(conversation.toPrimitives());
  });

  it('should reject conversations with the same participant twice', () => {
    expect(
      () =>
        new OneToOneConversation(
          ConversationId.deterministic(
            firstParticipant,
            secondParticipant,
            networkId,
          ),
          networkId,
          ConversationType.ONE_TO_ONE,
          [firstParticipant, firstParticipant],
        ),
    ).toThrow(ConversationMustHaveTwoDifferentParticipantsError);
  });
});
