import { IdentityId } from '../../shared/domain/value-objects/IdentityId';
import { PrivateAuthorizationScope } from '../domain/PrivateAuthorizationScope';

export interface PrivateAuthorizationGenesisCommit {
  ownerIdentityId: IdentityId;
  projection: Record<string, unknown>;
  protectedMlsState: string;
  scope: PrivateAuthorizationScope;
}
