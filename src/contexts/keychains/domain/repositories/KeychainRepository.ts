import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Keychain } from '../Keychain';

export interface KeychainRepository {
  findCandidatesByOwnerId(ownerIdentityId: IdentityId): Promise<Keychain[]>;
  save(keychain: Keychain): Promise<void>;
}
