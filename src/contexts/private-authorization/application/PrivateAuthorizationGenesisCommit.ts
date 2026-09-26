import { PrivateAuthorizationScope } from '../domain/PrivateAuthorizationScope';

export interface PrivateAuthorizationGenesisCommit {
  projection: Record<string, unknown>;
  protectedMlsState: string;
  scope: PrivateAuthorizationScope;
}
