import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceSealingView } from '@app/contexts/identity-devices/domain/DeviceSealingView';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { mock } from 'jest-mock-extended';

function credentialStub(wire: string): DeviceCredential {
  const credential = mock<DeviceCredential>();
  credential.toWire.mockReturnValue(wire);
  credential.isEqual.mockImplementation(
    (other) => (other as unknown as DeviceCredential).toWire() === wire,
  );

  return credential;
}

describe(DeviceSealingView.name, () => {
  it('orders devices by code unit, independent of locale collation', () => {
    // Code-unit order: 'B' < 'a' < 'b'; locale collation puts 'a' first.
    const lower = credentialStub('aAAA');
    const upper = credentialStub('BBBB');
    const underscore = credentialStub('a_AA');
    const authorization = mock<DeviceAuthorization>();
    authorization.getCredentials.mockReturnValue([lower, underscore, upper]);

    const view = new DeviceSealingView(
      mock<DeviceAuthorizationRevision>(),
      authorization,
      [],
    );

    expect(
      view.getDevices().map((device) => device.credential.toWire()),
    ).toEqual(['BBBB', 'aAAA', 'a_AA']);
  });
});
