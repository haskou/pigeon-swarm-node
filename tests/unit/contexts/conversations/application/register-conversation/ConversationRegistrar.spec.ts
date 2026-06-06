import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-conversation/messages/RegisterConversationMessage';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('ConversationRegistrar', () => {
  let repository: MockProxy<ConversationRepository>;
  let registrar: ConversationRegistrar;
  let mother: ConversationMother;

  beforeEach(async () => {
    repository = mock<ConversationRepository>();
    registrar = new ConversationRegistrar(repository);
    mother = await ConversationMother.create();
  });

  it('registers remote conversation metadata', async () => {
    const conversation = mother.build();
    const primitives = conversation.toPrimitives();

    repository.findMetadataById.mockResolvedValue(undefined);

    await registrar.register(
      new RegisterConversationMessage({
        conversationId: primitives.id,
        networkId: primitives.networkId,
        participantIds: primitives.participantIds,
        type: primitives.type,
      }),
    );

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls[0][0].toPrimitives()).toEqual({
      ...primitives,
      messages: [],
    });
  });

  it('keeps existing conversation metadata untouched', async () => {
    const conversation = mother.build();
    const primitives = conversation.toPrimitives();

    repository.findMetadataById.mockResolvedValue(conversation);

    await registrar.register(
      new RegisterConversationMessage({
        conversationId: primitives.id,
        networkId: primitives.networkId,
        participantIds: primitives.participantIds,
        type: primitives.type,
      }),
    );

    expect(repository.save).not.toHaveBeenCalled();
  });
});
