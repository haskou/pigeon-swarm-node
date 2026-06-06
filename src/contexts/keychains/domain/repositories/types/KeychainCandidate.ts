import { Keychain } from '../../Keychain';
import { KeychainExternalIdentifier } from '../../value-objects/KeychainExternalIdentifier';

export interface KeychainCandidate {
  externalIdentifier: KeychainExternalIdentifier;
  keychain: Keychain;
  source?: 'local' | 'remote';
}
