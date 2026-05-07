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
import { IdentityMustHaveAtLeastOneNetworkError } from './errors/IdentityMustHaveAtLeastOneNetworkError';
import { InvalidIdentitySignatureError } from './errors/InvalidIdentitySignatureError';
import { IdentityWasCreatedEvent } from './events/IdentityWasCreatedEvent';
import { IdentityWasUpdatedEvent } from './events/IdentityWasUpdatedEvent';
import { Profile } from './Profile';
import { IdentityCid } from './value-objects/IdentityCid';
import { IdentityVersion } from './value-objects/IdentityVersion';
import { ProfileName } from './value-objects/ProfileName';

export class Identity extends AggregateRoot {
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
      primitives.previousCid
        ? new IdentityCid(primitives.previousCid)
        : undefined,
    );
  }

  public static async create(
    name: ProfileName,
    password: Password,
    networks: NetworkId[] = [],
  ): Promise<Identity> {
    const keyPair = await KeyPair.generate();
    const encryptedKeyPair = await keyPair.encryptKeyPair(password);
    const primitiveEncryptedKeyPair = encryptedKeyPair.toPrimitives();
    const identityId = new IdentityId(primitiveEncryptedKeyPair.publicKey);
    const primitives: PrimitiveOf<Identity> = {
      encryptedKeyPair: primitiveEncryptedKeyPair,
      id: identityId.valueOf(),
      networks: networks.map((networkId) => networkId.valueOf()),
      previousCid: undefined,
      profile: new Profile(name).toPrimitives(),
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

    identity.record(new IdentityWasCreatedEvent(primitives.id));

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
    private readonly previousCid?: IdentityCid,
  ) {
    super();

    assert(
      new IdentitySignatureDomainService().isValidSignature(
        this.encryptedKeyPair,
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

  public toPrimitives() {
    return {
      encryptedKeyPair: this.encryptedKeyPair.toPrimitives(),
      id: this.id.valueOf(),
      networks: this.networks.toArray().map((networkId) => networkId.valueOf()),
      previousCid: this.previousCid?.valueOf(),
      profile: this.profile.toPrimitives(),
      signature: this.signature.valueOf(),
      timestamp: this.timestamp.valueOf(),
      version: this.version.valueOf(),
    };
  }

  public async updateNetworks(
    networks: NetworkId[],
    password: Password,
    previousCid: IdentityCid,
  ): Promise<Identity> {
    const primitives = await this.signNextPrimitives(
      {
        ...this.toPrimitives(),
        networks: networks.map((networkId) => networkId.valueOf()),
        previousCid: previousCid.valueOf(),
        timestamp: Timestamp.now().valueOf(),
        version: this.version.next().valueOf(),
      },
      password,
    );
    const identity = Identity.fromPrimitives(primitives);

    identity.record(new IdentityWasUpdatedEvent(primitives.id));

    return identity;
  }

  public async updateProfile(
    profile: Profile,
    password: Password,
    previousCid: IdentityCid,
  ): Promise<Identity> {
    const primitives = await this.signNextPrimitives(
      {
        ...this.toPrimitives(),
        previousCid: previousCid.valueOf(),
        profile: profile.toPrimitives(),
        timestamp: Timestamp.now().valueOf(),
        version: this.version.next().valueOf(),
      },
      password,
    );
    const identity = Identity.fromPrimitives(primitives);

    identity.record(new IdentityWasUpdatedEvent(primitives.id));

    return identity;
  }
}
