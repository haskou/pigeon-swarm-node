import { DeviceAuthorizationResource } from './DeviceAuthorizationResource';
import { DeviceSealedSecretHandoverResource } from './DeviceSealedSecretHandoverResource';

export interface DeviceAuthorizationTransitionResource extends DeviceAuthorizationResource {
  sealedSecrets?: DeviceSealedSecretHandoverResource;
}
