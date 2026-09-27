export interface IpfsIdentityDocument {
  _id: string;
  authorizationRevision: number;
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
