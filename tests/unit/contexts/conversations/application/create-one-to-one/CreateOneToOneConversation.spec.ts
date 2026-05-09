import CreateOneToOneConversation from '@app/contexts/conversations/application/create-one-to-one/CreateOneToOneConversation';
import { CreateOneToOneConversationMessage } from '@app/contexts/conversations/application/create-one-to-one/messages/CreateOneToOneConversationMessage';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('CreateOneToOneConversation', () => {
  let repository: MockProxy<ConversationRepository>;
  let creator: CreateOneToOneConversation;
  let mother: ConversationMother;

  beforeEach(async () => {
    repository = mock<ConversationRepository>();
    creator = new CreateOneToOneConversation(repository);
    mother = await ConversationMother.create();
  });

  it('should create and save a one-to-one conversation when it does not exist', async () => {
    repository.findOneToOne.mockResolvedValue(undefined);

    const conversation = await creator.create(
      new CreateOneToOneConversationMessage(
        mother.author.valueOf(),
        mother.recipient.valueOf(),
      ),
    );

    expect(repository.findOneToOne).toHaveBeenCalledWith(
      mother.author,
      mother.recipient,
    );
    expect(repository.save).toHaveBeenCalledWith(conversation);
    expect(conversation.toPrimitives().participantIds).toEqual([
      mother.author.valueOf(),
      mother.recipient.valueOf(),
    ]);
  });

  it('should return an existing one-to-one conversation without saving it again', async () => {
    const existing = mother.build();

    repository.findOneToOne.mockResolvedValue(existing);

    const conversation = await creator.create(
      new CreateOneToOneConversationMessage(
        mother.author.valueOf(),
        mother.recipient.valueOf(),
      ),
    );

    expect(conversation).toBe(existing);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
