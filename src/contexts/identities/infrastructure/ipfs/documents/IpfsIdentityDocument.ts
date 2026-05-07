export interface IpfsIdentityDocument {
  _id: string;
  encryptedKeyPair: {
    publicKey: string;
    encryptedPrivateKey: string;
  };
  networks: string[];
  previousCid: string | undefined;
  profile: {
    name: string;
    biography: string | undefined;
    picture: string | undefined;
  };
  timestamp: number;
  version: number;
  signature: string;
}
