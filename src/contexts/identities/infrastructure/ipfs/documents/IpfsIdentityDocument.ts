export interface IpfsIdentityDocument {
  _id: string;
  admissionNonce?: string;
  authorizationRevision: number;
  deviceCredential: string;
  deviceCredentialCommitment: string;
  networks: string[];
  previousCid: string | undefined;
  profile: {
    banner: string | undefined;
    biography: string | undefined;
    handle: string | undefined;
    name: string;
    picture: string | undefined;
  };
  recoveryAuthority: string;
  timestamp: number;
  version: number;
  signature: string;
}
