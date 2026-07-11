import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import {
  assert,
  PrimitiveOf,
  Signature,
  Timestamp,
  UniqueObjectArray,
} from '@haskou/value-objects';

import { IdentitySignatureDomainService } from './domain-services/IdentitySignatureDomainService';
import { IdentityCannotLeaveNetworkError } from './errors/IdentityCannotLeaveNetworkError';
import { IdentityMustHaveAtLeastOneNetworkError } from './errors/IdentityMustHaveAtLeastOneNetworkError';
import { InvalidIdentitySignatureError } from './errors/InvalidIdentitySignatureError';
import { IdentityWasCreatedEvent } from './events/IdentityWasCreatedEvent';
import { IdentityWasUpdatedEvent } from './events/IdentityWasUpdatedEvent';
import { IdentityPublication } from './IdentityPublication';
import { IdentitySignaturePayload } from './IdentitySignaturePayload';
import { Profile } from './Profile';
import { EncryptedMasterKey } from './value-objects/EncryptedMasterKey';
import { IdentityExternalIdentifier } from './value-objects/IdentityExternalIdentifier';
import { IdentitySigningKey } from './value-objects/IdentitySigningKey';
import { MasterKeyDerivation } from './value-objects/MasterKeyDerivation';
import { ProfileHandle } from './value-objects/ProfileHandle';

export class Identity extends AggregateRoot {
  public static fromPrimitives(primitives: PrimitiveOf<Identity>): Identity {
    return new Identity(
      new IdentityId(primitives.id),
      IdentitySigningKey.fromPrimitives(primitives.encryptedKeyPair),
      new EncryptedMasterKey(primitives.encryptedMasterKey),
      MasterKeyDerivation.fromPrimitives(primitives.masterKeyDerivation),
      UniqueObjectArray.fromArray(
        primitives.networks.map((networkId) => new NetworkId(networkId)),
      ),
      IdentityPublication.fromPrimitives(primitives),
    );
  }

  public static fromSignedPublication(
    primitives: PrimitiveOf<Identity>,
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

  constructor(
    private readonly id: IdentityId,
    private readonly signingKey: IdentitySigningKey,
    private readonly encryptedMasterKey: EncryptedMasterKey,
    private readonly masterKeyDerivation: MasterKeyDerivation,
    private readonly networks: UniqueObjectArray<NetworkId>,
    private readonly publication: IdentityPublication,
  ) {
    super();

    assert(
      this.signingKey.identifies(this.id),
      new InvalidIdentitySignatureError(),
    );
    assert(
      new IdentitySignatureDomainService().isValidSignature(
        this.id,
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

  private async signPublication(
    payload: IdentitySignaturePayload,
    password: Password,
  ): Promise<Signature> {
    return new IdentitySignatureDomainService().generateSignature(
      payload,
      this.signingKey,
      password,
    );
  }

  private ensureKeepsCurrentNetworks(networks: NetworkId[]): void {
    assert(
      this.networks
        .toArray()
        .every((currentNetworkId) =>
          networks.some((networkId) => networkId.isEqual(currentNetworkId)),
        ),
      new IdentityCannotLeaveNetworkError(),
    );
  }

  public hasHandle(handle: ProfileHandle): boolean {
    return this.publication.hasHandle(handle);
  }

  public getNetworkIds(): NetworkId[] {
    return this.networks.toArray();
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

  public isIdentifiedBy(id: IdentityId): boolean {
    return this.id.isEqual(id);
  }

  public isNewerThan(other: Identity): boolean {
    return this.publication.isNewerThan(other.publication);
  }

  public isNextVersionAfter(previous: Identity): boolean {
    return this.publication.isNextVersionAfter(previous.publication);
  }

  public usesSameSigningKeyAs(previous: Identity): boolean {
    return this.signingKey.signsSameIdentityAs(previous.signingKey);
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

  public toPrimitives() {
    return {
      encryptedKeyPair: this.signingKey.toPrimitives(),
      encryptedMasterKey: this.encryptedMasterKey.valueOf(),
      id: this.id.valueOf(),
      masterKeyDerivation: this.masterKeyDerivation.toPrimitives(),
      networks: this.networks.toArray().map((networkId) => networkId.valueOf()),
      ...this.publication.toPrimitives(),
    };
  }

  public async updateNetworks(
    networks: NetworkId[],
    password: Password,
    previousIdentityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity> {
    this.ensureKeepsCurrentNetworks(networks);

    const unsignedPublication = {
      ...this.toPrimitives(),
      networks: networks.map((networkId) => networkId.valueOf()),
      previousIdentityExternalIdentifier:
        previousIdentityExternalIdentifier.valueOf(),
      signature: '',
      timestamp: Timestamp.now().valueOf(),
      version: this.publication.nextVersion().valueOf(),
    };
    const signature = await this.signPublication(
      IdentitySignaturePayload.fromPrimitives(unsignedPublication),
      password,
    );
    const primitives = {
      ...unsignedPublication,
      signature: signature.valueOf(),
    };
    const identity = Identity.fromPrimitives(primitives);

    identity.record(
      new IdentityWasUpdatedEvent(primitives.id, {
        networkIds: primitives.networks,
      }),
    );

    return identity;
  }

  public async updateProfile(
    profile: Profile,
    password: Password,
    previousIdentityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity> {
    const unsignedPublication = {
      ...this.toPrimitives(),
      previousIdentityExternalIdentifier:
        previousIdentityExternalIdentifier.valueOf(),
      profile: profile.toPrimitives(),
      signature: '',
      timestamp: Timestamp.now().valueOf(),
      version: this.publication.nextVersion().valueOf(),
    };
    const signature = await this.signPublication(
      IdentitySignaturePayload.fromPrimitives(unsignedPublication),
      password,
    );
    const primitives = {
      ...unsignedPublication,
      signature: signature.valueOf(),
    };
    const identity = Identity.fromPrimitives(primitives);

    identity.record(
      new IdentityWasUpdatedEvent(primitives.id, {
        networkIds: primitives.networks,
      }),
    );

    return identity;
  }
}
