import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Keychain } from '../../domain/Keychain';
import { KeychainExternalIdentifier } from '../../domain/value-objects/KeychainExternalIdentifier';
import { KeychainMetadataRecord } from './KeychainMetadataRecord';

export default abstract class KeychainMetadataIndex {
  public abstract findAll(): Promise<KeychainMetadataRecord[]>;

  public abstract findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<KeychainMetadataRecord | undefined>;

  public abstract findByOwnerIdentityId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainMetadataRecord[]>;

  public abstract save(
    keychain: Keychain,
    externalIdentifier: KeychainExternalIdentifier,
    networkIds?: NetworkId[],
  ): Promise<void>;
}
