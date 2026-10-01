import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class DeviceAuthorizationProvisionMessage {
  public constructor(
    public readonly identityId: IdentityId,
    public readonly identityVersion: IdentityVersion,
    public readonly identityExternalIdentifier: IdentityExternalIdentifier,
    public readonly networkIds: NetworkId[],
    public readonly credential: DeviceCredential,
    public readonly recoveryAuthority: RecoveryAuthority,
  ) {}
}
