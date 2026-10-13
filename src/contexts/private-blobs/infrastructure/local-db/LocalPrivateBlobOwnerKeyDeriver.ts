import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { createHmac, randomBytes } from 'crypto';

import PrivateBlobOwnerKeyDeriver from '../../domain/services/PrivateBlobOwnerKeyDeriver';

/**
 * HMAC-SHA256 of the identity id under a random per-node salt. The salt is
 * created on first use and kept in the embedded local database, so owner keys
 * stay stable across restarts and never leave the node.
 */
export default class LocalPrivateBlobOwnerKeyDeriver extends PrivateBlobOwnerKeyDeriver {
  private static readonly META = 'private_blob_meta';
  private static readonly SALT_ID = 'owner-key-salt';

  private saltPromise?: Promise<Buffer>;

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private async loadOrCreateSalt(): Promise<Buffer> {
    const stored = await this.database.findOne(
      LocalPrivateBlobOwnerKeyDeriver.META,
      LocalPrivateBlobOwnerKeyDeriver.SALT_ID,
    );

    if (typeof stored?.salt === 'string') {
      return Buffer.from(stored.salt, 'hex');
    }

    const salt = randomBytes(32);

    await this.database.save(
      LocalPrivateBlobOwnerKeyDeriver.META,
      LocalPrivateBlobOwnerKeyDeriver.SALT_ID,
      { salt: salt.toString('hex') },
    );

    return salt;
  }

  public async derive(identityId: string): Promise<string> {
    this.saltPromise ??= this.loadOrCreateSalt();

    return createHmac('sha256', await this.saltPromise)
      .update(identityId)
      .digest('hex');
  }
}
