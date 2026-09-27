import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateMlsPolicyDevice } from '@app/contexts/private-authorization/domain/PrivateMlsPolicyDevice';

export default class PrivateMlsPolicyVerifier {
  private normalize(devices: PrivateMlsPolicyDevice[]): string[] {
    const deviceKeys = new Set(devices.map((device) => device.deviceKey));
    const credentialHashes = new Set(
      devices.map((device) => device.mlsCredentialHash),
    );
    const valid =
      devices.length > 0 &&
      devices.length <= 128 &&
      deviceKeys.size === devices.length &&
      credentialHashes.size === devices.length &&
      devices.every((device) => device.deviceKey && device.mlsCredentialHash);

    if (!valid) throw new InvalidPrivateAuthorizationError();

    return devices
      .map((device) => `${device.deviceKey}\0${device.mlsCredentialHash}`)
      .sort();
  }

  public verify(
    candidateDevices: PrivateMlsPolicyDevice[],
    policyDevices: PrivateMlsPolicyDevice[],
  ): void {
    const candidate = this.normalize(candidateDevices);
    const policy = this.normalize(policyDevices);

    if (
      candidate.length !== policy.length ||
      candidate.some((device, index) => device !== policy[index])
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
