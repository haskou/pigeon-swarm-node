import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Keychain } from '../Keychain';
import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';
import { KeychainMetadataRecord } from './types/KeychainMetadataRecord';

export default abstract class KeychainMetadataRepository {
  public abstract findAll(): Promise<KeychainMetadataRecord[]>;

  public abstract findByOwnerIdentityId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainMetadataRecord[]>;

  public abstract save(
    keychain: Keychain,
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<void>;
}
