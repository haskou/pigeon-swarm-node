export interface IpfsIdentityDocument {
  _id: string;
  encryptedKeyPair: {
    publicKey: string;
    encryptedPrivateKey: string;
  };
  networks: string[];
  profile: {
    name: string;
    biography: string | undefined;
    picture: string | undefined;
  };
  timestamp: number;
  signature: string;
}
