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

  /** Code-unit order: locale collation would make the order node-dependent. */
  private static compareCodeUnits(left: string, right: string): number {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  }

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
          .filter((record) => record.getDeviceCredential().isEqual(credential))
          .map((record) => ({
            sealingPublicKey: record.getSealingPublicKey(),
            utcDay: record.getUtcDay(),
          }))
          .sort((a, b) =>
            DeviceSealingView.compareCodeUnits(a.utcDay, b.utcDay),
          ),
      }))
      .sort((a, b) =>
        DeviceSealingView.compareCodeUnits(
          a.credential.toWire(),
          b.credential.toWire(),
        ),
      );
  }

  public getRevision(): DeviceAuthorizationRevision {
    return this.revision;
  }

  public getDevices(): DeviceSealingViewDevice[] {
    return [...this.devices];
  }
}
