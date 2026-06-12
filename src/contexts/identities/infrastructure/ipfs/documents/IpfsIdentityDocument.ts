export interface IpfsIdentityDocument {
  _id: string;
  encryptedKeyPair: {
    publicKey: string;
    encryptedPrivateKey: string;
  };
  encryptedMasterKey: string;
  masterKeyDerivation: Record<string, unknown>;
  networks: string[];
  previousCid: string | undefined;
  profile: {
    banner: string | undefined;
    biography: string | undefined;
    handle: string | undefined;
    name: string;
    picture: string | undefined;
  };
  timestamp: number;
  version: number;
  signature: string;
}
