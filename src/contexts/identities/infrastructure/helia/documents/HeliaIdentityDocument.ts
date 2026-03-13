export interface HeliaIdentityDocument {
  _id: string;
  encryptedKeyPair: {
    publicKey: string;
    encryptedPrivateKey: string;
  };
  profile: {
    name: string;
    biography: string | undefined;
    picture: string | undefined;
  };
  timestamp: number;
  signature: string;
}
