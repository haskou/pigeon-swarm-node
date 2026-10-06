import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import NotificationInvitationMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationInvitationMutationPolicy';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { mock } from 'jest-mock-extended';

import { ConversationMother } from '../../../../../mothers/ConversationMother';

const NONCE = 'notification-test-nonce-0001';

describe('NotificationInvitationMutationPolicy', () => {
  let mother: ConversationMother;
  let conversations: ReturnType<typeof mock<ConversationRepository>>;
  let policy: NotificationInvitationMutationPolicy;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversations = mock<ConversationRepository>();
    policy = new NotificationInvitationMutationPolicy(conversations, mock<OrbitDBCommunityRepository>());
  });

  function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const base = {
      encryptedKey: 'encrypted-conversation-key',
      inviterIdentityId: mother.author.valueOf(),
      nonce: NONCE,
      recipientIdentityId: mother.recipient.valueOf(),
      subjectId: mother.build().getId().valueOf(),
      type: 'conversation_invitation',
      ...overrides,
    };

    return {
      id: NotificationId.invitation(
        base.inviterIdentityId as string,
        base.recipientIdentityId as string,
        base.subjectId as string,
        base.nonce as string,
      ).valueOf(),
      scopeType: 'notification_invitation',
      ...base,
      ...(overrides.id ? { id: overrides.id } : {}),
    };
  }

  it('expects the inviter as author and the derived id', () => {
    const value = record();

    expect(policy.expectationOf(value)).toEqual({
      authorIdentityId: mother.author.valueOf(),
      recordId: value.id,
      store: 'notifications',
    });
  });

  it.each([
    ['id mismatch', { id: 'invitation:' + '0'.repeat(64) }],
    ['unknown type', { type: 'missed_call' }],
    ['short nonce', { nonce: 'short' }],
    ['unknown field', { extra: 1 }],
    ['removed tombstone', { removed: true }],
  ])('rejects %s', (_n, overrides) => {
    expect(() => policy.expectationOf(record(overrides))).toThrow(InvalidPublicMutationError);
  });

  it('accepts participants of the signed conversation', async () => {
    conversations.findMetadataById.mockResolvedValue(mother.build());

    await expect(policy.assertPermitted(record(), mother.author.valueOf(), false)).resolves.toBeUndefined();
  });

  it('rejects an inviter outside the conversation', async () => {
    const outsider = await ConversationMother.generateIdentityId();

    conversations.findMetadataById.mockResolvedValue(mother.build());

    await expect(
      policy.assertPermitted(record({ inviterIdentityId: outsider.valueOf() }), outsider.valueOf(), false),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it('rejects a recipient outside the conversation', async () => {
    const outsider = await ConversationMother.generateIdentityId();

    conversations.findMetadataById.mockResolvedValue(mother.build());

    await expect(
      policy.assertPermitted(record({ recipientIdentityId: outsider.valueOf() }), mother.author.valueOf(), false),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it('rejects an unknown conversation and deletions', async () => {
    conversations.findMetadataById.mockResolvedValue(undefined);

    await expect(policy.assertPermitted(record(), mother.author.valueOf(), false)).rejects.toBeInstanceOf(
      InvalidPublicMutationError,
    );
    await expect(policy.assertPermitted(record(), mother.author.valueOf(), true)).rejects.toBeInstanceOf(
      InvalidPublicMutationError,
    );
  });
});
