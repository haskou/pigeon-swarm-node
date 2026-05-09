import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Keychain } from '../Keychain';
import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';

export interface KeychainRepository {
  findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain | undefined>;
  findCandidatesByOwnerId(ownerIdentityId: IdentityId): Promise<Keychain[]>;
  save(keychain: Keychain): Promise<KeychainExternalIdentifier>;
}
