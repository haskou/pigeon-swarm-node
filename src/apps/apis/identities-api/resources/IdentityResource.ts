export interface IdentityResource {
  id: string;
  encryptedKeyPair: {
    encryptedPrivateKey: string;
    publicKey: string;
  };
  encryptedMasterKey: string;
  masterKeyDerivation: Record<string, unknown>;
  networks: string[];
  profile: {
    banner: string | undefined;
    biography: string | undefined;
    handle: string | undefined;
    name: string;
    picture: string | undefined;
  };
  timestamp: number;
  signature: string;
  version: number;
  identityExternalIdentifier?: string;
  previousIdentityExternalIdentifier?: string;
}
