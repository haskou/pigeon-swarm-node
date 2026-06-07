/* eslint-disable max-params */
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import {
  assert,
  EncryptedKeyPair,
  KeyPair,
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
import { Profile } from './Profile';
import { PreviousIdentityReference as PreviousReference } from './types/PreviousIdentityReference';
import { IdentityExternalIdentifier } from './value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from './value-objects/IdentityVersion';
import { ProfileHandle } from './value-objects/ProfileHandle';
import { ProfileName } from './value-objects/ProfileName';

export class Identity extends AggregateRoot {
  private readonly previousIdentityExternalIdentifier?: PreviousReference;

  public static fromPrimitives(primitives: PrimitiveOf<Identity>): Identity {
    return new Identity(
      new IdentityId(primitives.id),
      EncryptedKeyPair.fromPrimitives(primitives.encryptedKeyPair),
      UniqueObjectArray.fromArray(
        primitives.networks.map((networkId) => new NetworkId(networkId)),
      ),
      Profile.fromPrimitives(primitives.profile),
      new Timestamp(primitives.timestamp),
      new Signature(primitives.signature),
      new IdentityVersion(primitives.version),
      primitives.previousIdentityExternalIdentifier
        ? new IdentityExternalIdentifier(
            primitives.previousIdentityExternalIdentifier,
          )
        : undefined,
    );
  }

  public static async create(
    name: ProfileName,
    password: Password,
    networks: NetworkId[] = [],
    handle?: ProfileHandle,
  ): Promise<Identity> {
    const keyPair = await KeyPair.generate();
    const encryptedKeyPair = await keyPair.encryptKeyPair(password);
    const primitiveEncryptedKeyPair = encryptedKeyPair.toPrimitives();
    const identityId = new IdentityId(primitiveEncryptedKeyPair.publicKey);
    const primitives: PrimitiveOf<Identity> = {
      encryptedKeyPair: primitiveEncryptedKeyPair,
      id: identityId.valueOf(),
      networks: networks.map((networkId) => networkId.valueOf()),
      previousIdentityExternalIdentifier: undefined,
      profile: new Profile(
        name,
        undefined,
        undefined,
        undefined,
        handle,
      ).toPrimitives(),
      signature: '',
      timestamp: Timestamp.now().valueOf(),
      version: 1,
    };
    const signature =
      await new IdentitySignatureDomainService().generateSignature(
        primitives,
        encryptedKeyPair,
        password,
      );
    primitives.signature = signature.valueOf();

    const identity = Identity.fromPrimitives(primitives);

    identity.record(
      new IdentityWasCreatedEvent(primitives.id, {
        networkIds: primitives.networks,
      }),
    );

    return identity;
  }

  public static publishCandidate(primitives: PrimitiveOf<Identity>): Identity {
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
    private readonly encryptedKeyPair: EncryptedKeyPair,
    private readonly networks: UniqueObjectArray<NetworkId>,
    private profile: Profile,
    private timestamp: Timestamp,
    private signature: Signature,
    private readonly version: IdentityVersion,
    previousReference?: PreviousReference,
  ) {
    super();
    this.previousIdentityExternalIdentifier = previousReference;

    assert(
      this.hasIdentityIdBoundToSigningKey(),
      new InvalidIdentitySignatureError(),
    );
    assert(
      new IdentitySignatureDomainService().isValidSignature(
        this.id,
        this.toPrimitives(),
        this.signature,
      ),
      new InvalidIdentitySignatureError(),
    );
    assert(
      this.networks.length() > 0,
      new IdentityMustHaveAtLeastOneNetworkError(),
    );
  }

  private getSigningIdentityId(): IdentityId {
    return new IdentityId(this.encryptedKeyPair.toPrimitives().publicKey);
  }

  private hasIdentityIdBoundToSigningKey(): boolean {
    return this.id.isEqual(this.getSigningIdentityId());
  }

  private async signNextPrimitives(
    primitives: PrimitiveOf<Identity>,
    password: Password,
  ): Promise<PrimitiveOf<Identity>> {
    const nextPrimitives = {
      ...primitives,
      signature: '',
    };
    const signature =
      await new IdentitySignatureDomainService().generateSignature(
        nextPrimitives,
        this.encryptedKeyPair,
        password,
      );

    return {
      ...nextPrimitives,
      signature: signature.valueOf(),
    };
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
    return this.profile.hasHandle(handle);
  }

  public getId(): IdentityId {
    return this.id;
  }

  public hasNoPreviousReference(): boolean {
    return this.previousIdentityExternalIdentifier === undefined;
  }

  public getPreviousReference(): IdentityExternalIdentifier | undefined {
    return this.previousIdentityExternalIdentifier;
  }

  public isFirstVersion(): boolean {
    return this.version.isFirst();
  }

  public isIdentifiedBy(id: IdentityId): boolean {
    return this.id.isEqual(id);
  }

  public isNewerThan(other: Identity): boolean {
    return this.version.isGreaterThan(other.version);
  }

  public isNextVersionAfter(previous: Identity): boolean {
    return this.version.isNextAfter(previous.version);
  }

  public usesSameSigningKeyAs(previous: Identity): boolean {
    return this.getSigningIdentityId().isEqual(previous.getSigningIdentityId());
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
      encryptedKeyPair: this.encryptedKeyPair.toPrimitives(),
      id: this.id.valueOf(),
      networks: this.networks.toArray().map((networkId) => networkId.valueOf()),
      previousIdentityExternalIdentifier:
        this.previousIdentityExternalIdentifier?.valueOf(),
      profile: this.profile.toPrimitives(),
      signature: this.signature.valueOf(),
      timestamp: this.timestamp.valueOf(),
      version: this.version.valueOf(),
    };
  }

  public async updateNetworks(
    networks: NetworkId[],
    password: Password,
    previousIdentityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity> {
    this.ensureKeepsCurrentNetworks(networks);

    const primitives = await this.signNextPrimitives(
      {
        ...this.toPrimitives(),
        networks: networks.map((networkId) => networkId.valueOf()),
        previousIdentityExternalIdentifier:
          previousIdentityExternalIdentifier.valueOf(),
        timestamp: Timestamp.now().valueOf(),
        version: this.version.next().valueOf(),
      },
      password,
    );
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
    const primitives = await this.signNextPrimitives(
      {
        ...this.toPrimitives(),
        previousIdentityExternalIdentifier:
          previousIdentityExternalIdentifier.valueOf(),
        profile: profile.toPrimitives(),
        timestamp: Timestamp.now().valueOf(),
        version: this.version.next().valueOf(),
      },
      password,
    );
    const identity = Identity.fromPrimitives(primitives);

    identity.record(
      new IdentityWasUpdatedEvent(primitives.id, {
        networkIds: primitives.networks,
      }),
    );

    return identity;
  }
}
