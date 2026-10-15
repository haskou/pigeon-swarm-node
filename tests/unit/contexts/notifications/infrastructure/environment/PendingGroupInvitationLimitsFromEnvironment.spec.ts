import { PendingGroupInvitationLimits } from '@app/contexts/notifications/domain/PendingGroupInvitationLimits';
import { PendingGroupInvitationLimitsFromEnvironment } from '@app/contexts/notifications/infrastructure/environment/PendingGroupInvitationLimitsFromEnvironment';

describe('PendingGroupInvitationLimitsFromEnvironment', () => {
  const keys = [
    'NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR',
    'NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('defaults to 4 per pair and 100 per recipient', () => {
    expect(PendingGroupInvitationLimitsFromEnvironment.load()).toEqual(
      new PendingGroupInvitationLimits(4, 100),
    );
  });

  it('honours positive integer overrides', () => {
    process.env.NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR = '2';
    process.env.NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT = '7';

    expect(PendingGroupInvitationLimitsFromEnvironment.load()).toEqual(
      new PendingGroupInvitationLimits(2, 7),
    );
  });

  it.each(['0', '-3', '1.5', 'many', '9007199254740993'])(
    'falls back to the defaults for %s',
    (value) => {
      process.env.NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR = value;
      process.env.NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT =
        value;

      expect(PendingGroupInvitationLimitsFromEnvironment.load()).toEqual(
        new PendingGroupInvitationLimits(4, 100),
      );
    },
  );
});
