import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PrivateAuthorizationDeviceKey } from '../../../domain/value-objects/PrivateAuthorizationDeviceKey';
import { PrivateGenesisJson } from '../../../domain/value-objects/PrivateGenesisJson';
import { PrivateGenesisProjection } from '../../../domain/value-objects/PrivateGenesisProjection';
import { PrivateProtectedMlsState } from '../../../domain/value-objects/PrivateProtectedMlsState';

export class PrivateAuthorizationScopeProvisionMessage {
  public readonly authenticatedIdentityId: IdentityId;
  public readonly identityAuthorizationRevision: DeviceAuthorizationRevision;
  public readonly ownerDeviceKey: PrivateAuthorizationDeviceKey;
  public readonly signedGenesisJson: PrivateGenesisJson;
  public readonly protectedMlsState: PrivateProtectedMlsState;
  public readonly projection: PrivateGenesisProjection;

  public constructor(
    authenticatedIdentityId: string,
    identityAuthorizationRevision: number,
    ownerDeviceKey: string,
    signedGenesisJson: string,
    protectedMlsState: string,
    projection: Record<string, unknown>,
  ) {
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
    this.identityAuthorizationRevision = new DeviceAuthorizationRevision(
      identityAuthorizationRevision,
    );
    this.ownerDeviceKey = new PrivateAuthorizationDeviceKey(ownerDeviceKey);
    this.signedGenesisJson = new PrivateGenesisJson(signedGenesisJson);
    this.protectedMlsState = new PrivateProtectedMlsState(protectedMlsState);
    this.projection = new PrivateGenesisProjection(projection);
  }
}
