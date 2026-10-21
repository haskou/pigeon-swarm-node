import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';

export interface DeviceSealingViewDevice {
  credential: DeviceCredential;
  sealingKeys: { sealingPublicKey: string; utcDay: string }[];
}
