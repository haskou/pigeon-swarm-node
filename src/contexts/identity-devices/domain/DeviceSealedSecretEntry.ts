import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';

export interface DeviceSealedSecretEntry {
  recipientCredential: DeviceCredential;
  sealedSecret: string;
  signature: string;
}
