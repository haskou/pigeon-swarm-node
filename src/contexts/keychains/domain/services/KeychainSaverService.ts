import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Keychain } from '../Keychain';
import { KeychainRepository } from '../repositories/KeychainRepository';
import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';

export default class KeychainSaverService {
  constructor(private readonly repository: KeychainRepository) {}

  public async save(
    keychain: Keychain,
    networkIds: NetworkId[],
  ): Promise<KeychainExternalIdentifier> {
    return this.repository.save(keychain, networkIds);
  }
}
