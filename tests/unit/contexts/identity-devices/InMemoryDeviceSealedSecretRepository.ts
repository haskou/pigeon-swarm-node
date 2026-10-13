import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretNotFoundError';
import { DeviceSealedSecretRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealedSecretRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class InMemoryDeviceSealedSecretRepository extends DeviceSealedSecretRepository {
  public readonly stored = new Map<string, DeviceSealedSecretBundle>();

  public has(identityId: IdentityId): Promise<boolean> {
    return Promise.resolve(this.stored.has(identityId.valueOf()));
  }

  public require(identityId: IdentityId): Promise<DeviceSealedSecretBundle> {
    const bundle = this.stored.get(identityId.valueOf());

    if (!bundle) {
      return Promise.reject(new DeviceSealedSecretNotFoundError());
    }

    return Promise.resolve(bundle);
  }

  public replaceIfNewer(bundle: DeviceSealedSecretBundle): Promise<void> {
    const key = bundle.getIdentityId().valueOf();
    bundle.assertSupersedes(this.stored.get(key));
    this.stored.set(key, bundle);

    return Promise.resolve();
  }
}
