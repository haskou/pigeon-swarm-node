import { PrivateAuthorizationGenesis } from './PrivateAuthorizationGenesis';

export abstract class PrivateGenesisAuthenticator {
  public abstract verify(
    signedGenesisJson: string,
    expectedOwnerDeviceKey: string,
    protectedMlsState: string,
  ): PrivateAuthorizationGenesis;
}
