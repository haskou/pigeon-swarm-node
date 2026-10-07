import { NotificationReplicationLimits } from '@app/contexts/notifications/domain/NotificationReplicationLimits';
import NotificationStateMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationStateMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../../mothers/ConversationMother';
import { signedMutation } from '../../../../public-mutations/support/signedMutation';

const NID = `invitation:${'a'.repeat(64)}`;
const RECIPIENT =
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';

describe('NotificationStateMutationPolicy', () => {
  let docs: Record<string, unknown>[];
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let verifier: MockProxy<PublicMutationVerifier>;
  let policy: NotificationStateMutationPolicy;
  let otherRecipient: string;

  beforeAll(async () => {
    otherRecipient = (await ConversationMother.generateIdentityId()).valueOf();
  });

  beforeEach(() => {
    docs = [
      {
        id: NID,
        recipientIdentityId: RECIPIENT,
        scopeType: 'notification_invitation',
      },
    ];
    registry = mock<OrbitDBReplicatedStateRegistry>();
    registry.queryDocuments.mockImplementation(async (_store, matcher) =>
      docs.filter(matcher),
    );
    registry.queryUnadmittedDocuments.mockImplementation(
      async (_store, matcher) => docs.filter(matcher),
    );
    verifier = mock<PublicMutationVerifier>();
    verifier.verify.mockImplementation(async (proof, expectation) => {
      if (
        proof.getBody().payloadDigest !==
        PublicMutationProof.digestOf(expectation.payload)
      ) {
        throw new InvalidPublicMutationError();
      }
    });
    policy = new NotificationStateMutationPolicy(registry, verifier);
    policy.limits = new NotificationReplicationLimits(100, 3);
  });

  const record = (
    o: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: `notification-state:${NID}:accepted`,
    notificationId: NID,
    read: true,
    recipientIdentityId: RECIPIENT,
    scopeType: 'notification_state',
    state: 'accepted',
    ...o,
  });

  it('expects the recipient as author', () => {
    expect(policy.expectationOf(record())).toEqual({
      authorIdentityId: RECIPIENT,
      recordId: `notification-state:${NID}:accepted`,
      store: 'notifications',
    });
  });

  it.each([
    ['id mismatch', { id: 'notification-state:other' }],
    ['unread mark', { read: false }],
    ['unknown state', { state: 'weird' }],
    [
      'missed call target',
      {
        id: 'notification-state:missed-call:x:y:accepted',
        notificationId: 'missed-call:x:y',
      },
    ],
  ])('rejects %s', (_n, o) => {
    expect(() => policy.expectationOf(record(o))).toThrow(
      InvalidPublicMutationError,
    );
  });

  it('accepts the recipient of an admitted invitation', async () => {
    await expect(
      policy.assertPermitted(record(), RECIPIENT, false),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-recipient author', async () => {
    await expect(
      policy.assertPermitted(record(), 'someone-else', false),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it('rejects an unknown notification', async () => {
    docs = [];

    await expect(
      policy.assertPermitted(record(), RECIPIENT, false),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
  });

  it('keeps terminal states absorbing', async () => {
    docs.push({
      notificationId: NID,
      scopeType: 'notification_state',
      state: 'accepted',
    });

    await expect(
      policy.assertPermitted(
        record({ id: `notification-state:${NID}:declined`, state: 'declined' }),
        RECIPIENT,
        false,
      ),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    await expect(
      policy.assertPermitted(
        record({ id: `notification-state:${NID}:pending`, state: 'pending' }),
        RECIPIENT,
        false,
      ),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    await expect(
      policy.assertPermitted(record(), RECIPIENT, false),
    ).resolves.toBeUndefined();
  });

  describe('state quota', () => {
    const notificationOf = (index: number): string =>
      `invitation:${String(index).repeat(64)}`;

    const byId = (
      left: Record<string, unknown>,
      right: Record<string, unknown>,
    ): number => ((left.id as string) < (right.id as string) ? -1 : 1);

    /** A signed state record of a recipient for the nth invitation. */
    async function stored(
      index: number,
      overrides: Record<string, unknown> = {},
    ): Promise<Record<string, unknown>> {
      const payload = record({
        id: `notification-state:${notificationOf(index)}:accepted`,
        notificationId: notificationOf(index),
        ...overrides,
      });

      return {
        ...payload,
        proof: (
          await signedMutation({
            identityId: payload.recipientIdentityId as string,
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

    /** The state of an admitted invitation whose id sorts after every stored one. */
    function latest(): Record<string, unknown> {
      const index = 9;

      docs.push({
        id: notificationOf(index),
        recipientIdentityId: RECIPIENT,
        scopeType: 'notification_invitation',
      });

      return record({
        id: `notification-state:${notificationOf(index)}:accepted`,
        notificationId: notificationOf(index),
      });
    }

    it('admits a state while fewer genuine states sort before it', async () => {
      const states = (
        await Promise.all([1, 2, 3, 4].map((index) => stored(index)))
      ).sort(byId);

      for (const state of states) {
        docs.push({
          id: state.notificationId,
          recipientIdentityId: RECIPIENT,
          scopeType: 'notification_invitation',
        });
      }
      docs.push(...states);
      const [, , third, fourth] = states;

      await expect(
        policy.assertPermitted(payloadOf(third), RECIPIENT, false),
      ).resolves.toBeUndefined();
      await expect(
        policy.assertPermitted(payloadOf(fourth), RECIPIENT, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('reaches the same verdict whatever order the states were stored in', async () => {
      const states = (
        await Promise.all([1, 2, 3, 4].map((index) => stored(index)))
      ).sort(byId);

      for (const state of states) {
        docs.push({
          id: state.notificationId,
          recipientIdentityId: RECIPIENT,
          scopeType: 'notification_invitation',
        });
      }
      docs.push(...[...states].reverse());

      await expect(
        policy.assertPermitted(payloadOf(states[3]), RECIPIENT, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('counts only the states of the same recipient', async () => {
      docs.push(
        ...(await Promise.all(
          [1, 2, 3, 4].map((index) =>
            stored(index, { recipientIdentityId: otherRecipient }),
          ),
        )),
      );

      await expect(
        policy.assertPermitted(latest(), RECIPIENT, false),
      ).resolves.toBeUndefined();
    });

    it('does not count stored states whose proof does not verify', async () => {
      docs.push(
        ...(await Promise.all([1, 2, 3].map((index) => stored(index)))),
      );
      verifier.verify.mockRejectedValue(new InvalidPublicMutationError());

      await expect(
        policy.assertPermitted(latest(), RECIPIENT, false),
      ).resolves.toBeUndefined();
    });

    it('does not count stored states without a proof', async () => {
      docs.push(
        ...(await Promise.all([1, 2, 3].map((index) => stored(index)))).map(
          payloadOf,
        ),
      );

      await expect(
        policy.assertPermitted(latest(), RECIPIENT, false),
      ).resolves.toBeUndefined();
    });

    it('refuses once the genuine states fill the quota', async () => {
      docs.push(
        ...(await Promise.all([1, 2, 3].map((index) => stored(index)))),
      );

      await expect(
        policy.assertPermitted(latest(), RECIPIENT, false),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('does not count a proof copied onto another payload', async () => {
      const genuine = await stored(1);
      const copy = { ...payloadOf(await stored(2)), proof: genuine.proof };

      policy.limits = new NotificationReplicationLimits(100, 2);
      docs.push(genuine, copy);

      await expect(
        policy.assertPermitted(latest(), RECIPIENT, false),
      ).resolves.toBeUndefined();
    });
  });
});
