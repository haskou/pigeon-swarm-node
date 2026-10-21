import { DeviceSealingView } from '@app/contexts/identity-devices/domain/DeviceSealingView';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceSealingViewResource } from '../resources/DeviceSealingViewResource';

export class DeviceSealingViewViewModel {
  public constructor(
    private readonly identityId: IdentityId,
    private readonly view: DeviceSealingView,
  ) {}

  public toResource(): DeviceSealingViewResource {
    return {
      devices: this.view.getDevices().map((device) => ({
        deviceCredential: device.credential.toWire(),
        sealingKeys: device.sealingKeys.map(
          ({ sealingPublicKey, utcDay }) => ({ sealingPublicKey, utcDay }),
        ),
      })),
      identityId: this.identityId.valueOf(),
      revision: this.view.getRevision().valueOf(),
    };
  }
}
