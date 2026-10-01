import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { UniqueObjectArray, assert } from '@haskou/value-objects';

import { DeviceAuthorizationPrimitives } from './DeviceAuthorizationPrimitives';
import { InvalidDeviceAuthorizationTransitionError } from './errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationEpoch } from './value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

export class DeviceAuthorization extends AggregateRoot {
  private static readonly MAX_CREDENTIALS = 128;

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
      new DeviceAuthorizationEpoch(primitives.epoch),
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
      DeviceAuthorizationEpoch.genesis(),
      UniqueObjectArray.fromArray([credential]),
    );
  }

  public constructor(
    private readonly identityId: IdentityId,
    private readonly networkIds: UniqueObjectArray<NetworkId>,
    private readonly recoveryAuthority: RecoveryAuthority,
    private readonly revision: DeviceAuthorizationRevision,
    private readonly epoch: DeviceAuthorizationEpoch,
    private readonly credentials: UniqueObjectArray<DeviceCredential>,
  ) {
    super();
    assert(
      this.networkIds.length() > 0,
      new InvalidDeviceAuthorizationTransitionError(),
    );
    assert(
      this.credentials.length() <= DeviceAuthorization.MAX_CREDENTIALS,
      new InvalidDeviceAuthorizationTransitionError(),
    );
    assert(
      this.recoveryAuthority.isIndependentFrom([
        DeviceCredential.fromIdentityId(this.identityId),
        ...this.credentials.toArray(),
      ]),
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

  public getEpoch(): DeviceAuthorizationEpoch {
    return this.epoch;
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
      this.epoch,
      UniqueObjectArray.fromArray([...this.credentials.toArray(), credential]),
    );
  }

  public enrollConcurrently(
    credentials: DeviceCredential[],
  ): DeviceAuthorization {
    const availableCredentials =
      DeviceAuthorization.MAX_CREDENTIALS - this.credentials.length();
    const newCredentials = [
      ...new Map(
        credentials.map((credential) => [credential.valueOf(), credential]),
      ).values(),
    ]
      .filter((credential) => !this.isAuthorized(credential))
      .sort((left, right) => left.valueOf().localeCompare(right.valueOf()))
      .slice(0, availableCredentials);

    assert(
      newCredentials.length > 0,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      this.revision.next(),
      this.epoch,
      UniqueObjectArray.fromArray([
        ...this.credentials.toArray(),
        ...newCredentials,
      ]),
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
      this.epoch,
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
      this.epoch,
      UniqueObjectArray.fromArray(
        this.credentials
          .toArray()
          .filter((authorized) =>
            revokedCredentials.every((revoked) => !authorized.isEqual(revoked)),
          ),
      ),
    );
  }

  public recover(
    credential: DeviceCredential,
    epoch: DeviceAuthorizationEpoch,
  ): DeviceAuthorization {
    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      this.revision.next(),
      epoch,
      UniqueObjectArray.fromArray([credential]),
    );
  }

  public recoverAt(
    revision: DeviceAuthorizationRevision,
    credential: DeviceCredential,
    epoch: DeviceAuthorizationEpoch,
  ): DeviceAuthorization {
    assert(
      revision.valueOf() > this.revision.valueOf(),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      revision,
      epoch,
      UniqueObjectArray.fromArray([credential]),
    );
  }

  public requireRecoveryAt(
    revision: DeviceAuthorizationRevision,
  ): DeviceAuthorization {
    assert(
      revision.isGreaterThan(this.revision),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorization(
      this.identityId,
      this.networkIds,
      this.recoveryAuthority,
      revision,
      this.epoch,
      UniqueObjectArray.fromArray<DeviceCredential>([]),
    );
  }

  public toPrimitives(): DeviceAuthorizationPrimitives {
    return {
      credentials: this.credentials
        .toArray()
        .map((credential) => credential.valueOf()),
      epoch: this.epoch.valueOf(),
      identityId: this.identityId.valueOf(),
      networkIds: this.networkIds
        .toArray()
        .map((networkId) => networkId.valueOf()),
      recoveryAuthority: this.recoveryAuthority.valueOf(),
      revision: this.revision.valueOf(),
    };
  }
}
