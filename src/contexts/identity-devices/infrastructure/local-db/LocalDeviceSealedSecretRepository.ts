import {
  DeviceSealedSecretBundle,
  DeviceSealedSecretBundlePrimitives,
} from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretGenerationStaleError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretGenerationStaleError';
import { DeviceSealedSecretRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealedSecretRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

const NAMESPACE = 'device-sealed-secrets';

export default class LocalDeviceSealedSecretRepository extends DeviceSealedSecretRepository {
  private readonly pending = new Map<string, Promise<unknown>>();

  public constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  public async find(
    identityId: IdentityId,
  ): Promise<DeviceSealedSecretBundle | undefined> {
    const document = await this.database.findOne(
      NAMESPACE,
      identityId.valueOf(),
    );

    if (!document) {
      return undefined;
    }

    return DeviceSealedSecretBundle.fromPrimitives(
      document as unknown as DeviceSealedSecretBundlePrimitives,
    );
  }

  public replaceIfNewer(bundle: DeviceSealedSecretBundle): Promise<void> {
    const identityId = bundle.getIdentityId();

    return this.serialize(identityId, async () => {
      const stored = await this.find(identityId);

      if (stored && stored.getGeneration() >= bundle.getGeneration()) {
        throw new DeviceSealedSecretGenerationStaleError();
      }

      await this.database.save(
        NAMESPACE,
        identityId.valueOf(),
        bundle.toPrimitives() as unknown as Record<string, unknown>,
      );
    });
  }

  private serialize<T>(
    identityId: IdentityId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = identityId.valueOf();
    const run = (this.pending.get(key) ?? Promise.resolve())
      .catch((): undefined => undefined)
      .then(operation);
    const tail = run.catch((): undefined => undefined);

    this.pending.set(key, tail);
    void tail.then(() => {
      if (this.pending.get(key) === tail) {
        this.pending.delete(key);
      }
    });

    return run;
  }
}
