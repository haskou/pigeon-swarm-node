export interface IdentityResource {
  id: string;
  encryptedKeyPair: {
    encryptedPrivateKey: string;
    publicKey: string;
  };
  networks: string[];
  profile: {
    name: string;
    biography: string | undefined;
    picture: string | undefined;
  };
  timestamp: number;
  signature: string;
  version: number;
  previousIdentityExternalIdentifier?: string;
}
