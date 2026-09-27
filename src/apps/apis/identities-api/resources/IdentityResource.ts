export interface IdentityResource {
  id: string;
  authorizationRevision: number;
  deviceCredentialCommitment: string;
  networks: string[];
  profile: {
    banner: string | undefined;
    biography: string | undefined;
    handle: string | undefined;
    name: string;
    picture: string | undefined;
  };
  recoveryAuthority: string;
  timestamp: number;
  signature: string;
  version: number;
  identityExternalIdentifier?: string;
  previousIdentityExternalIdentifier?: string;
}
