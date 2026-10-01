import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { UniqueObjectArray, assert } from '@haskou/value-objects';

import { IdentitySignatureDomainService } from './domain-services/IdentitySignatureDomainService';
import { IdentityMustHaveAtLeastOneNetworkError } from './errors/IdentityMustHaveAtLeastOneNetworkError';
import { InvalidIdentitySignatureError } from './errors/InvalidIdentitySignatureError';
import { IdentityWasCreatedEvent } from './events/IdentityWasCreatedEvent';
import { IdentityWasUpdatedEvent } from './events/IdentityWasUpdatedEvent';
import { IdentityPrimitives } from './IdentityPrimitives';
import { IdentityPublication } from './IdentityPublication';
import { IdentitySignaturePayload } from './IdentitySignaturePayload';
import { DeviceCredential } from './value-objects/DeviceCredential';
import { DeviceCredentialCommitment } from './value-objects/DeviceCredentialCommitment';
import { IdentityAuthorizationRevision } from './value-objects/IdentityAuthorizationRevision';
import { IdentityExternalIdentifier } from './value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from './value-objects/IdentityVersion';
import { ProfileHandle } from './value-objects/ProfileHandle';
import { RecoveryAuthority } from './value-objects/RecoveryAuthority';

export class Identity extends AggregateRoot {
  public static fromPrimitives(primitives: IdentityPrimitives): Identity {
    return new Identity(
      new IdentityId(primitives.id),
      DeviceCredential.fromString(primitives.deviceCredential),
      new DeviceCredentialCommitment(primitives.deviceCredentialCommitment),
      RecoveryAuthority.fromString(primitives.recoveryAuthority),
      new IdentityAuthorizationRevision(primitives.authorizationRevision),
      UniqueObjectArray.fromArray(
        primitives.networks.map((networkId) => new NetworkId(networkId)),
      ),
      IdentityPublication.fromPrimitives(primitives),
    );
  }

  public static fromSignedPublication(
    primitives: IdentityPrimitives,
  ): Identity {
    const identity = Identity.fromPrimitives(primitives);

    identity.record(
      primitives.version === 1
        ? new IdentityWasCreatedEvent(primitives.id, {
            networkIds: primitives.networks,
          })
        : new IdentityWasUpdatedEvent(primitives.id, {
            networkIds: primitives.networks,
          }),
    );

    return identity;
  }

  public constructor(
    private readonly id: IdentityId,
    private readonly deviceCredential: DeviceCredential,
    private readonly deviceCredentialCommitment: DeviceCredentialCommitment,
    private readonly recoveryAuthority: RecoveryAuthority,
    private readonly authorizationRevision: IdentityAuthorizationRevision,
    private readonly networks: UniqueObjectArray<NetworkId>,
    private readonly publication: IdentityPublication,
  ) {
    super();

    assert(
      this.deviceCredential
        .getCommitment()
        .isEqual(this.deviceCredentialCommitment),
      new InvalidIdentitySignatureError(),
    );
    assert(
      this.recoveryAuthority.isIndependentFrom([
        DeviceCredential.fromIdentityId(this.id),
        this.deviceCredential,
      ]),
      new InvalidIdentitySignatureError(),
    );
    assert(
      new IdentitySignatureDomainService().isValidSignature(
        DeviceCredential.fromIdentityId(this.id),
        IdentitySignaturePayload.fromPrimitives(this.toPrimitives()),
        this.publication.getSignature(),
      ),
      new InvalidIdentitySignatureError(),
    );
    assert(
      this.networks.length() > 0,
      new IdentityMustHaveAtLeastOneNetworkError(),
    );
  }

  public hasHandle(handle: ProfileHandle): boolean {
    return this.publication.hasHandle(handle);
  }

  public getNetworkIds(): NetworkId[] {
    return this.networks.toArray();
  }

  public getInitialDeviceCredential(): DeviceCredential {
    return this.deviceCredential;
  }

  public getRecoveryAuthority(): RecoveryAuthority {
    return this.recoveryAuthority;
  }

  public hasNoPreviousReference(): boolean {
    return this.publication.hasNoPreviousReference();
  }

  public getPreviousReference(): IdentityExternalIdentifier | undefined {
    return this.publication.getPreviousReference();
  }

  public isFirstVersion(): boolean {
    return this.publication.isFirstVersion();
  }

  public getVersion(): IdentityVersion {
    return this.publication.getVersion();
  }

  public hasInitialAuthorizationRevision(): boolean {
    return this.authorizationRevision.isEqual(
      IdentityAuthorizationRevision.initial(),
    );
  }

  public doesNotRollbackAuthorizationFrom(previous: Identity): boolean {
    return this.authorizationRevision.isGreaterOrEqualThan(
      previous.authorizationRevision,
    );
  }

  public isIdentifiedBy(id: IdentityId): boolean {
    return this.id.isEqual(id);
  }

  public isNewerThan(other: Identity): boolean {
    return this.publication.isNewerThan(other.publication);
  }

  public isNextVersionAfter(previous: Identity): boolean {
    return this.publication.isNextVersionAfter(previous.publication);
  }

  public usesSameGenesisAuthorizationAs(previous: Identity): boolean {
    return (
      this.deviceCredentialCommitment.isEqual(
        previous.deviceCredentialCommitment,
      ) &&
      this.deviceCredential.isEqual(previous.deviceCredential) &&
      this.recoveryAuthority.isEqual(previous.recoveryAuthority)
    );
  }

  public keepsNetworksFrom(previous: Identity): boolean {
    return previous.networks
      .toArray()
      .every((previousNetworkId) =>
        this.networks
          .toArray()
          .some((networkId) => networkId.isEqual(previousNetworkId)),
      );
  }

  public toPrimitives(): IdentityPrimitives {
    return {
      authorizationRevision: this.authorizationRevision.valueOf(),
      deviceCredential: this.deviceCredential.valueOf(),
      deviceCredentialCommitment: this.deviceCredentialCommitment.valueOf(),
      id: this.id.valueOf(),
      networks: this.networks.toArray().map((networkId) => networkId.valueOf()),
      recoveryAuthority: this.recoveryAuthority.valueOf(),
      ...this.publication.toPrimitives(),
    };
  }
}
