import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { UniqueObjectArray, assert } from '@haskou/value-objects';

import { DeviceAuthorizationPrimitives } from './DeviceAuthorizationPrimitives';
import { InvalidDeviceAuthorizationTransitionError } from './errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

export class DeviceAuthorization extends AggregateRoot {
  public static fromPrimitives(
    primitives: DeviceAuthorizationPrimitives,
  ): DeviceAuthorization {
    return new DeviceAuthorization(
      new IdentityId(primitives.identityId),
      UniqueObjectArray.fromArray(
        primitives.networkIds.map((networkId) => new NetworkId(networkId)),
      ),
      RecoveryAuthority.fromString(primitives.recoveryAuthority),
      new DeviceAuthorizationRevision(primitives.revision),
      UniqueObjectArray.fromArray(
        primitives.credentials.map((credential) =>
          DeviceCredential.fromString(credential),
        ),
      ),
    );
  }

  public static genesis(
    identityId: IdentityId,
    networkIds: NetworkId[],
    credential: DeviceCredential,
    recoveryAuthority: RecoveryAuthority,
  ): DeviceAuthorization {
    return new DeviceAuthorization(
      identityId,
      UniqueObjectArray.fromArray(networkIds),
      recoveryAuthority,
      DeviceAuthorizationRevision.initial(),
      UniqueObjectArray.fromArray([credential]),
    );
  }

  public constructor(
    private readonly identityId: IdentityId,
    private readonly networkIds: UniqueObjectArray<NetworkId>,
    private readonly recoveryAuthority: RecoveryAuthority,
    private readonly revision: DeviceAuthorizationRevision,
    private readonly credentials: UniqueObjectArray<DeviceCredential>,
  ) {
    super();
    assert(
      this.networkIds.length() > 0,
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getRecoveryAuthority(): RecoveryAuthority {
    return this.recoveryAuthority;
  }

  public getNetworkIds(): NetworkId[] {
    return this.networkIds.toArray();
  }

  public getRevision(): DeviceAuthorizationRevision {
    return this.revision;
  }

  public getCredentials(): DeviceCredential[] {
    return this.credentials.toArray();
  }

  public isAuthorized(credential: DeviceCredential): boolean {
    return this.credentials
      .toArray()
      .some((authorized) => authorized.isEqual(credential));
  }

  public isAtRevision(revision: DeviceAuthorizationRevision): boolean {
    return this.revision.isEqual(revision);
  }

  public enroll(credential: DeviceCredential): DeviceAuthorization {
    assert(
      !this.isAuthorized(credential),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      this.revision.next(),
      UniqueObjectArray.fromArray([...this.credentials.toArray(), credential]),
    );
  }

  public revoke(credential: DeviceCredential): DeviceAuthorization {
    assert(
      this.isAuthorized(credential) && this.credentials.length() > 1,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      this.revision.next(),
      UniqueObjectArray.fromArray(
        this.credentials
          .toArray()
          .filter((authorized) => !authorized.isEqual(credential)),
      ),
    );
  }

  public revokeConcurrently(
    credentials: DeviceCredential[],
  ): DeviceAuthorization {
    const revokedCredentials = credentials.filter((credential) =>
      this.isAuthorized(credential),
    );

    assert(
      revokedCredentials.length > 0,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      this.revision.next(),
      UniqueObjectArray.fromArray(
        this.credentials
          .toArray()
          .filter((authorized) =>
            revokedCredentials.every((revoked) => !authorized.isEqual(revoked)),
          ),
      ),
    );
  }

  public recover(credential: DeviceCredential): DeviceAuthorization {
    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      this.revision.next(),
      UniqueObjectArray.fromArray([credential]),
    );
  }

  public toPrimitives(): DeviceAuthorizationPrimitives {
    return {
      credentials: this.credentials
        .toArray()
        .map((credential) => credential.valueOf()),
      identityId: this.identityId.valueOf(),
      networkIds: this.networkIds
        .toArray()
        .map((networkId) => networkId.valueOf()),
      recoveryAuthority: this.recoveryAuthority.valueOf(),
      revision: this.revision.valueOf(),
    };
  }
}
