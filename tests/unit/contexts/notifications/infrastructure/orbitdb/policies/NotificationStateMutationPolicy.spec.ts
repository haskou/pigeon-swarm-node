import NotificationStateMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationStateMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

const NID = `invitation:${'a'.repeat(64)}`;
const RECIPIENT =
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';

describe('NotificationStateMutationPolicy', () => {
  let docs: Record<string, unknown>[];
  let policy: NotificationStateMutationPolicy;

  beforeEach(() => {
    docs = [
      {
        id: NID,
        recipientIdentityId: RECIPIENT,
        scopeType: 'notification_invitation',
      },
    ];
    policy = new NotificationStateMutationPolicy({
      queryDocuments: jest.fn(
        (_s: string, m: (d: Record<string, unknown>) => boolean) =>
          Promise.resolve(docs.filter(m)),
      ),
    } as unknown as OrbitDBReplicatedStateRegistry);
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
});
