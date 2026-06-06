export type KeychainSignaturePayload = {
  encryptedPayload: string;
  ownerIdentityId: string;
  previousKeychainExternalIdentifier?: string;
  timestamp: number;
  version: number;
};
