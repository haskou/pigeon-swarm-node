import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import { NotificationReplicationLimits } from '@app/contexts/notifications/domain/NotificationReplicationLimits';
import NotificationInvitationMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationInvitationMutationPolicy';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../../mothers/ConversationMother';
import { signedMutation } from '../../../../public-mutations/support/signedMutation';

const NONCE = 'notification-test-nonce-0001';

describe('NotificationInvitationMutationPolicy', () => {
  let mother: ConversationMother;
  let conversations: MockProxy<ConversationRepository>;
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let verifier: MockProxy<PublicMutationVerifier>;
  let storedDocuments: Record<string, unknown>[];
  let policy: NotificationInvitationMutationPolicy;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversations = mock<ConversationRepository>();
    registry = mock<OrbitDBReplicatedStateRegistry>();
    verifier = mock<PublicMutationVerifier>();
    storedDocuments = [];
    registry.queryUnadmittedDocuments.mockImplementation(
      async (_store, matcher) => storedDocuments.filter(matcher),
    );
    verifier.verify.mockImplementation(async (proof, expectation) => {
      if (
        proof.getBody().payloadDigest !==
        PublicMutationProof.digestOf(expectation.payload)
      ) {
        throw new InvalidPublicMutationError();
      }
    });
    policy = new NotificationInvitationMutationPolicy(
      conversations,
      mock<OrbitDBCommunityRepository>(),
      registry,
      verifier,
    );
    policy.limits = new NotificationReplicationLimits(3, 100);
  });

  function nonceOf(index: number): string {
    return `notification-test-nonce-${String(index).padStart(4, '0')}`;
  }

  function record(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
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
    expect(() => policy.expectationOf(record(overrides))).toThrow(
      InvalidPublicMutationError,
    );
  });

  it('accepts a community invitation that carries no key', () => {
    const value = record({ type: 'community_invitation' });

    delete value.encryptedKey;

    expect(() => policy.expectationOf(value)).not.toThrow();
  });

  it('rejects a community invitation that carries a key', () => {
    expect(() =>
      policy.expectationOf(record({ type: 'community_invitation' })),
    ).toThrow(InvalidPublicMutationError);
  });

  it('rejects a conversation invitation without a key', () => {
    const value = record();

    delete value.encryptedKey;

    expect(() => policy.expectationOf(value)).toThrow(
      InvalidPublicMutationError,
    );
  });

  it('accepts participants of the signed conversation', async () => {
    conversations.findMetadataById.mockResolvedValue(mother.build());

    await expect(
      policy.assertPermitted(record(), mother.author.valueOf(), false),
    ).resolves.toBeUndefined();
  });

  it('rejects an inviter outside the conversation', async () => {
    const outsider = await ConversationMother.generateIdentityId();

    conversations.findMetadataById.mockResolvedValue(mother.build());

    await expect(
      policy.assertPermitted(
        record({ inviterIdentityId: outsider.valueOf() }),
        outsider.valueOf(),
        false,
      ),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it('rejects a recipient outside the conversation', async () => {
    const outsider = await ConversationMother.generateIdentityId();

    conversations.findMetadataById.mockResolvedValue(mother.build());

    await expect(
      policy.assertPermitted(
        record({ recipientIdentityId: outsider.valueOf() }),
        mother.author.valueOf(),
        false,
      ),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it('rejects an unknown conversation and deletions', async () => {
    conversations.findMetadataById.mockResolvedValue(undefined);

    await expect(
      policy.assertPermitted(record(), mother.author.valueOf(), false),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    await expect(
      policy.assertPermitted(record(), mother.author.valueOf(), true),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  describe('invitation quota', () => {
    const byId = (
      left: Record<string, unknown>,
      right: Record<string, unknown>,
    ): number => ((left.id as string) < (right.id as string) ? -1 : 1);

    async function stored(
      index: number,
      overrides: Record<string, unknown> = {},
    ): Promise<Record<string, unknown>> {
      const payload = record({ nonce: nonceOf(index), ...overrides });

      return {
        ...payload,
        proof: (
          await signedMutation({
            identityId: payload.inviterIdentityId as string,
            kind: 'put',
            payload,
            recordId: payload.id as string,
            sequence: 0,
            store: 'notifications',
          })
        ).toPrimitives(),
      };
    }

    function payloadOf(
      document: Record<string, unknown>,
    ): Record<string, unknown> {
      return PublicMutationRecord.payloadOf(document);
    }

    /** An invitation of the author whose id sorts after every stored one. */
    function latestAfter(
      documents: Record<string, unknown>[],
    ): Record<string, unknown> {
      for (let index = 100; ; index += 1) {
        const candidate = record({ nonce: nonceOf(index) });

        if (
          documents.every(
            (document) => (document.id as string) < (candidate.id as string),
          )
        )
          return candidate;
      }
    }

    beforeEach(() => {
      conversations.findMetadataById.mockResolvedValue(mother.build());
    });

    it('admits an invitation while fewer genuine invitations sort before it', async () => {
      storedDocuments = (
        await Promise.all([1, 2, 3, 4].map((index) => stored(index)))
      ).sort(byId);
      const [, , third, fourth] = storedDocuments;

      await expect(
        policy.assertPermitted(
          payloadOf(third),
          mother.author.valueOf(),
          false,
        ),
      ).resolves.toBeUndefined();
      await expect(
        policy.assertPermitted(
          payloadOf(fourth),
          mother.author.valueOf(),
          false,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('reaches the same verdict whatever order the invitations were stored in', async () => {
      const documents = (
        await Promise.all([1, 2, 3, 4].map((index) => stored(index)))
      ).sort(byId);
      const fourth = payloadOf(documents[3]);

      storedDocuments = [...documents].reverse();

      await expect(
        policy.assertPermitted(fourth, mother.author.valueOf(), false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('counts only the invitations of the same inviter', async () => {
      storedDocuments = await Promise.all(
        [1, 2, 3, 4].map((index) =>
          stored(index, {
            inviterIdentityId: mother.recipient.valueOf(),
            recipientIdentityId: mother.author.valueOf(),
          }),
        ),
      );

      await expect(
        policy.assertPermitted(
          latestAfter(storedDocuments),
          mother.author.valueOf(),
          false,
        ),
      ).resolves.toBeUndefined();
    });

    it('does not count stored invitations whose proof does not verify', async () => {
      storedDocuments = await Promise.all(
        [1, 2, 3].map((index) => stored(index)),
      );
      verifier.verify.mockRejectedValue(new InvalidPublicMutationError());

      await expect(
        policy.assertPermitted(
          latestAfter(storedDocuments),
          mother.author.valueOf(),
          false,
        ),
      ).resolves.toBeUndefined();
    });

    it('does not count stored invitations without a proof', async () => {
      storedDocuments = (
        await Promise.all([1, 2, 3].map((index) => stored(index)))
      ).map(payloadOf);

      await expect(
        policy.assertPermitted(
          latestAfter(storedDocuments),
          mother.author.valueOf(),
          false,
        ),
      ).resolves.toBeUndefined();
    });

    it('refuses once the genuine invitations fill the quota', async () => {
      storedDocuments = await Promise.all(
        [1, 2, 3].map((index) => stored(index)),
      );

      await expect(
        policy.assertPermitted(
          latestAfter(storedDocuments),
          mother.author.valueOf(),
          false,
        ),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('does not count a proof copied onto another payload', async () => {
      const genuine = await stored(1);
      const copy = { ...record({ nonce: nonceOf(2) }), proof: genuine.proof };

      policy.limits = new NotificationReplicationLimits(2, 100);
      storedDocuments = [genuine, copy];

      await expect(
        policy.assertPermitted(
          latestAfter(storedDocuments),
          mother.author.valueOf(),
          false,
        ),
      ).resolves.toBeUndefined();
    });
  });
});
