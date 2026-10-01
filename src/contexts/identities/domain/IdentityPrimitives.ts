import { PrimitiveOf } from '@haskou/value-objects';

import { Profile } from './Profile';

export interface IdentityPrimitives {
  authorizationRevision: number;
  deviceCredential: string;
  deviceCredentialCommitment: string;
  id: string;
  networks: string[];
  previousIdentityExternalIdentifier?: string;
  profile: PrimitiveOf<Profile>;
  recoveryAuthority: string;
  signature: string;
  timestamp: number;
  version: number;
}
