export interface KeychainResource {
  encryptedPayload: string;
  keychainExternalIdentifier: string;
  ownerIdentityId: string;
  previousKeychainExternalIdentifier?: string;
  signature: string;
  timestamp: number;
  version: number;
}
