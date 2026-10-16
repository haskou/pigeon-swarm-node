import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { CommitmentId } from '@haskou/pigeon-swarm-crypto';

import PrivateBlobOwnerKeyDeriver from '../../domain/services/PrivateBlobOwnerKeyDeriver';
import { PrivateBlobOwnerKey } from '../../domain/value-objects/PrivateBlobOwnerKey';

/**
 * Keys an identity under a random per-node salt. The salt is created on first
 * use and kept in the embedded local database, so owner keys stay stable
 * across restarts and never leave the node.
 */
export default class LocalPrivateBlobOwnerKeyDeriver extends PrivateBlobOwnerKeyDeriver {
  private static readonly META = 'private_blob_meta';
  private static readonly SALT_ID = 'owner-key-salt';

  private saltPromise?: Promise<string>;

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private async loadOrCreateSalt(): Promise<string> {
    const stored = await this.database.findOne(
      LocalPrivateBlobOwnerKeyDeriver.META,
      LocalPrivateBlobOwnerKeyDeriver.SALT_ID,
    );

    if (typeof stored?.salt === 'string') {
      return stored.salt;
    }

    const salt = CommitmentId.privateBlobOwnerSalt();

    await this.database.save(
      LocalPrivateBlobOwnerKeyDeriver.META,
      LocalPrivateBlobOwnerKeyDeriver.SALT_ID,
      { salt },
    );

    return salt;
  }

  public async derive(identityId: IdentityId): Promise<PrivateBlobOwnerKey> {
    this.saltPromise ??= this.loadOrCreateSalt();

    return new PrivateBlobOwnerKey(
      CommitmentId.privateBlobOwner(
        await this.saltPromise,
        identityId.valueOf(),
      ),
    );
  }
}
