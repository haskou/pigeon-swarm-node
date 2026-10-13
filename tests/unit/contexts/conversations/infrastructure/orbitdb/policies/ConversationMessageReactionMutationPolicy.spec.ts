import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import ConversationMessageReactionMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageReactionMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../../mothers/ConversationMother';

describe('ConversationMessageReactionMutationPolicy', () => {
  const frontier = ['A'.repeat(43)];
  let mother: ConversationMother;
  let repository: MockProxy<ConversationRepository>;
  let policy: ConversationMessageReactionMutationPolicy;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    repository = mock<ConversationRepository>();
    policy = new ConversationMessageReactionMutationPolicy(repository);
  });

  function record(conversation: Conversation): Record<string, unknown> {
    const conversationId = conversation.getId().valueOf();
    const authorId = mother.author.valueOf();

    return {
      authorId,
      conversationId,
      createdAt: 1780000000000,
      emoji: '👍',
      id: `conversation:${conversationId}:message-1:${authorId}:👍`,
      messageId: 'message-1',
      scopeType: 'conversation',
    };
  }

  it('expects the reaction id as record id in the reactions store', () => {
    const conversation = mother.buildGroup();

    expect(policy.expectationOf(record(conversation))).toEqual({
      authorIdentityId: mother.author.valueOf(),
      recordId: record(conversation).id,
      store: 'reactions',
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
    ['put', false],
    ['deletion', true],
  ])(
    'rejects a %s of a one-to-one conversation reaction',
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
