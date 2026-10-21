import DeviceSealingViewFinder from '@app/contexts/identity-devices/application/find/DeviceSealingViewFinder';
import { DeviceSealingViewFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceSealingViewFindMessage';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealingRecordRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealingRecordRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  credentialOf,
  enrolledDeviceFixture,
} from '../DeviceSealedSecretFixtures';
import {
  sealingPublicKeyOf,
  sealingRecordOf,
  TODAY,
  YESTERDAY,
} from '../DeviceSealingRecordFixtures';

describe(DeviceSealingViewFinder.name, () => {
  let authorizations: MockProxy<DeviceAuthorizationRepository>;
  let records: MockProxy<DeviceSealingRecordRepository>;
  let finder: DeviceSealingViewFinder;

  beforeEach(() => {
    authorizations = mock<DeviceAuthorizationRepository>();
    records = mock<DeviceSealingRecordRepository>();
    finder = new DeviceSealingViewFinder(authorizations, records);
  });

  it('lists every authorized device with its current sealing keys, ordered', async () => {
    const fixture = await enrolledDeviceFixture();
    authorizations.require.mockResolvedValue(fixture.authorization);
    records.findCurrent.mockReturnValue([
      sealingRecordOf({
        identityId: fixture.identityId,
        sealingPublicKey: sealingPublicKeyOf(2),
        signer: fixture.owner,
        utcDay: TODAY,
      }),
      sealingRecordOf({
        identityId: fixture.identityId,
        sealingPublicKey: sealingPublicKeyOf(1),
        signer: fixture.owner,
        utcDay: YESTERDAY,
      }),
    ]);

    const view = await finder.find(
      new DeviceSealingViewFindMessage(new IdentityId(fixture.identityId)),
    );

    expect(view.getRevision().valueOf()).toBe(
      fixture.authorization.getRevision().valueOf(),
    );
    expect(
      view.getDevices().map((device) => device.credential.toWire()),
    ).toEqual([credentialOf(fixture.owner), credentialOf(fixture.candidate)].sort());
    expect(
      view
        .getDevices()
        .find((device) => device.credential.toWire() === credentialOf(fixture.owner))
        ?.sealingKeys,
    ).toEqual([
      { sealingPublicKey: sealingPublicKeyOf(1), utcDay: YESTERDAY },
      { sealingPublicKey: sealingPublicKeyOf(2), utcDay: TODAY },
    ]);
    expect(
      view
        .getDevices()
        .find((device) => device.credential.toWire() === credentialOf(fixture.candidate))
        ?.sealingKeys,
    ).toEqual([]);
  });

  it('rejects with the not-found error for an identity the node does not hold', async () => {
    authorizations.require.mockRejectedValue(new DeviceAuthorizationNotFoundError());

    await expect(
      finder.find(
        new DeviceSealingViewFindMessage(
          new IdentityId(credentialOf(await KeyPair.generate())),
        ),
      ),
    ).rejects.toThrow(DeviceAuthorizationNotFoundError);
  });
});
