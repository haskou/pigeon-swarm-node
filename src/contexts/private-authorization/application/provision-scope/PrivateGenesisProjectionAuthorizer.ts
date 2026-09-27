import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { PrivateAuthorizationScopeId } from '../../domain/value-objects/PrivateAuthorizationScopeId';

export abstract class PrivateGenesisProjectionAuthorizer {
  public abstract authorize(
    scopeId: PrivateAuthorizationScopeId,
    ownerIdentityId: IdentityId,
    projection: Record<string, unknown>,
  ): Record<string, unknown>;
}
