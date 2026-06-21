import { KeychainCandidate } from '@app/contexts/keychains/domain/KeychainCandidate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Keychain } from '../Keychain';
import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';

export default abstract class KeychainRepository {
  public abstract findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain | undefined>;

  public abstract findCandidateReferencesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainCandidate[]>;

  public abstract findCandidatesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<Keychain[]>;

  public abstract save(
    keychain: Keychain,
    networkIds: NetworkId[],
  ): Promise<KeychainExternalIdentifier>;
}
