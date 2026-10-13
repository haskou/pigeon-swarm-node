import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../../mothers/ConversationMother';

describe('ConversationMessagePinMutationPolicy', () => {
  const frontier = ['A'.repeat(43)];
  let mother: ConversationMother;
  let repository: MockProxy<ConversationRepository>;
  let policy: ConversationMessagePinMutationPolicy;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    repository = mock<ConversationRepository>();
    policy = new ConversationMessagePinMutationPolicy(repository);
  });

  function record(conversation: Conversation): Record<string, unknown> {
    const conversationId = conversation.getId().valueOf();

    return {
      conversationId,
      createdAt: 1780000000000,
      id: `conversation:${conversationId}:message-1`,
      messageId: 'message-1',
      pinnedByIdentityId: mother.author.valueOf(),
      scopeType: 'conversation',
    };
  }

  it('expects the pin id as record id in the pins store', () => {
    const conversation = mother.buildGroup();

    expect(policy.expectationOf(record(conversation))).toEqual({
      authorIdentityId: mother.author.valueOf(),
      recordId: record(conversation).id,
      store: 'pins',
    });
  });

  it('accepts a group conversation participant author', async () => {
    const conversation = mother.buildGroup();

    repository.requireMetadataAtFrontier.mockResolvedValue(conversation);

    await expect(
      policy.assertPermitted(
        record(conversation),
        mother.author.valueOf(),
        false,
        frontier,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects an author that is not a participant', async () => {
    const conversation = mother.buildGroup();
    const outsider = await ConversationMother.generateIdentityId();

    repository.requireMetadataAtFrontier.mockResolvedValue(conversation);

    await expect(
      policy.assertPermitted(
        record(conversation),
        outsider.valueOf(),
        false,
        frontier,
      ),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it.each([
    ['pin', false],
    ['unpin', true],
  ])(
    'rejects a %s of a one-to-one conversation message',
    async (_kind, isDeletion) => {
      const conversation = mother.build();

      repository.requireMetadataAtFrontier.mockResolvedValue(conversation);

      await expect(
        policy.assertPermitted(
          record(conversation),
          mother.author.valueOf(),
          isDeletion,
          frontier,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    },
  );
});
