import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Keychain } from '../Keychain';
import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';

export interface KeychainCandidate {
  externalIdentifier: KeychainExternalIdentifier;
  keychain: Keychain;
}

export interface KeychainRepository {
  findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain | undefined>;
  findCandidateReferencesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainCandidate[]>;
  findCandidatesByOwnerId(ownerIdentityId: IdentityId): Promise<Keychain[]>;
  save(
    keychain: Keychain,
    networkIds: NetworkId[],
  ): Promise<KeychainExternalIdentifier>;
}
