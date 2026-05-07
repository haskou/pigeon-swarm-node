import { ConversationMustHaveTwoDifferentParticipantsError } from '@app/contexts/conversations/domain/errors/ConversationMustHaveTwoDifferentParticipantsError';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/value-objects';

describe('OneToOneConversation', () => {
  let firstParticipant: IdentityId;
  let secondParticipant: IdentityId;

  beforeEach(async () => {
    firstParticipant = await generateIdentityId();
    secondParticipant = await generateIdentityId();
  });

  it('should create a deterministic id from the sorted participant ids', () => {
    const conversation = OneToOneConversation.create(
      firstParticipant,
      secondParticipant,
    );
    const reversed = OneToOneConversation.create(
      secondParticipant,
      firstParticipant,
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
    );

    const restored = OneToOneConversation.fromPrimitives(
      conversation.toPrimitives(),
    );

    expect(restored.toPrimitives()).toEqual(conversation.toPrimitives());
  });

  it('should reject conversations with the same participant twice', () => {
    expect(() =>
      OneToOneConversation.create(firstParticipant, firstParticipant),
    ).toThrow(ConversationMustHaveTwoDifferentParticipantsError);
  });
});

async function generateIdentityId(): Promise<IdentityId> {
  const keyPair = await KeyPair.generate();

  return new IdentityId(keyPair.toPrimitives().publicKey);
}
