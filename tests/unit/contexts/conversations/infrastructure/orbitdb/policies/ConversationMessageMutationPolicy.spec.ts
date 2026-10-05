import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import ConversationMessageMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { mock } from 'jest-mock-extended';

import { ConversationMother } from '../../../../../mothers/ConversationMother';

describe('ConversationMessageMutationPolicy', () => {
  let mother: ConversationMother;
  let repository: ReturnType<typeof mock<ConversationRepository>>;
  let policy: ConversationMessageMutationPolicy;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    repository = mock<ConversationRepository>();
    policy = new ConversationMessageMutationPolicy(repository);
  });

  function record(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      authorId: mother.author.valueOf(),
      conversationId: mother.build().getId().valueOf(),
      createdAt: 1780000000000,
      encryptedPayload: 'payload',
      id: 'message-1',
      previousMessageIds: [] as string[],
      scopeType: 'conversation',
      type: 'sent',
      ...overrides,
    };
  }

  it('expects the message id as record id in the messages store', () => {
    expect(policy.expectationOf(record())).toEqual({
      authorIdentityId: mother.author.valueOf(),
      recordId: 'message-1',
      store: 'messages',
    });
  });

  it.each([
    ['unknown type', { type: 'other' }],
    ['sent without payload', { encryptedPayload: undefined }],
    ['edited without target', { type: 'edited' }],
    [
      'deleted without target',
      { encryptedPayload: undefined, type: 'deleted' },
    ],
    ['poll without poll id', { encryptedPayload: undefined, type: 'poll' }],
    ['non string previous ids', { previousMessageIds: [1] }],
    ['unsigned local metadata', { receivedAt: 1 }],
  ])('rejects a record with %s', (_name, overrides) => {
    expect(() => policy.expectationOf(record(overrides))).toThrow(
      InvalidPublicMutationError,
    );
  });

  it('accepts a conversation participant author', async () => {
    const conversation = mother.build();

    repository.findMetadataById.mockResolvedValue(conversation);

    await expect(
      policy.assertPermitted(record(), mother.author.valueOf()),
    ).resolves.toBeUndefined();
  });

  it('rejects an author that is not a participant', async () => {
    const outsider = await ConversationMother.generateIdentityId();

    repository.findMetadataById.mockResolvedValue(mother.build());

    await expect(
      policy.assertPermitted(record(), outsider.valueOf()),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });
});
