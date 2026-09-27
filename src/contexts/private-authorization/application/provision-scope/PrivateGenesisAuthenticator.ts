import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PrivateAuthorizationGenesis } from './PrivateAuthorizationGenesis';

export abstract class PrivateGenesisAuthenticator {
  public abstract verify(
    signedGenesisJson: string,
    expectedOwnerDeviceKey: string,
    protectedMlsState: string,
    expectedOwnerIdentityId: IdentityId,
  ): PrivateAuthorizationGenesis;
}
