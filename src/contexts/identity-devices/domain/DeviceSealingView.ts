import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceSealingRecord } from './DeviceSealingRecord';
import { DeviceSealingViewDevice } from './DeviceSealingViewDevice';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

/**
 * What a sender needs to seal for an identity: the devices authorized at the
 * head and each one's current daily sealing keys. Nothing else about the
 * authorization leaves the node.
 */
export class DeviceSealingView {
  private readonly devices: DeviceSealingViewDevice[];

  public constructor(
    private readonly revision: DeviceAuthorizationRevision,
    authorization: DeviceAuthorization,
    records: DeviceSealingRecord[],
  ) {
    this.devices = authorization
      .getCredentials()
      .map((credential) => ({
        credential,
        sealingKeys: records
          .filter((record) =>
            record.getDeviceCredential().isEqual(credential),
          )
          .map((record) => ({
            sealingPublicKey: record.getSealingPublicKey(),
            utcDay: record.getUtcDay(),
          }))
          .sort((a, b) => a.utcDay.localeCompare(b.utcDay)),
      }))
      .sort((a, b) => a.credential.toWire().localeCompare(b.credential.toWire()));
  }

  public getRevision(): DeviceAuthorizationRevision {
    return this.revision;
  }

  public getDevices(): DeviceSealingViewDevice[] {
    return [...this.devices];
  }
}
