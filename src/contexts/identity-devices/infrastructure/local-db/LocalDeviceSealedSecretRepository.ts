import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretBundlePrimitivesShape } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundlePrimitivesShape';
import { DeviceSealedSecretNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretNotFoundError';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import { DeviceSealedSecretRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealedSecretRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

const NAMESPACE = 'device-sealed-secrets';

export default class LocalDeviceSealedSecretRepository extends DeviceSealedSecretRepository {
  private readonly pending = new Map<string, Promise<unknown>>();

  public constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
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

  private toBundle(
    document: Record<string, unknown>,
  ): DeviceSealedSecretBundle {
    const primitives = { ...document };

    delete primitives._id;

    if (
      !DeviceSealedSecretBundlePrimitivesShape.isBundlePrimitives(primitives)
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        'stored bundle is malformed',
      );
    }

    return DeviceSealedSecretBundle.fromPrimitives(primitives);
  }

  public async has(identityId: IdentityId): Promise<boolean> {
    const document = await this.database.findOne(
      NAMESPACE,
      identityId.valueOf(),
    );

    return document !== undefined;
  }

  public replaceIfNewer(bundle: DeviceSealedSecretBundle): Promise<void> {
    const identityId = bundle.getIdentityId();

    return this.serialize(identityId, async () => {
      const document = await this.database.findOne(
        NAMESPACE,
        identityId.valueOf(),
      );

      bundle.assertSupersedes(document ? this.toBundle(document) : undefined);

      await this.database.save(NAMESPACE, identityId.valueOf(), {
        ...bundle.toPrimitives(),
      });
    });
  }

  public async require(
    identityId: IdentityId,
  ): Promise<DeviceSealedSecretBundle> {
    const document = await this.database.findOne(
      NAMESPACE,
      identityId.valueOf(),
    );

    if (!document) {
      throw new DeviceSealedSecretNotFoundError();
    }

    return this.toBundle(document);
  }
}
