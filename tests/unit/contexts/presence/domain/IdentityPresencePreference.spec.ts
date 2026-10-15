import { IdentityPresencePreference } from '@app/contexts/presence/domain/IdentityPresencePreference';
import { PresenceStatus } from '@app/contexts/presence/domain/value-objects/PresenceStatus';
import { Timestamp } from '@haskou/value-objects';

describe('IdentityPresencePreference', () => {
  it('updates a selected status independently from lease heartbeats', () => {
    const preference = IdentityPresencePreference.fromPrimitives(
      'available',
      100,
    );

    const changed = preference.update(PresenceStatus.BUSY, new Timestamp(200));

    expect(changed).toBe(true);
    expect(preference.selected().isBusy()).toBe(true);
  });

  it('rejects disconnected as a user-selected status', () => {
    const preference = IdentityPresencePreference.fromPrimitives(
      'available',
      100,
    );

    expect(() =>
      preference.update(PresenceStatus.DISCONNECTED, new Timestamp(200)),
    ).toThrow('Disconnected presence is derived by heartbeat timeout.');
  });
});
