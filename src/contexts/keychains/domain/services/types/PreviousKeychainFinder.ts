import { Keychain } from '../../Keychain';
import { KeychainExternalIdentifier } from '../../value-objects/KeychainExternalIdentifier';

export type PreviousKeychainFinder = (
  externalIdentifier: KeychainExternalIdentifier,
) => Promise<Keychain | undefined>;
