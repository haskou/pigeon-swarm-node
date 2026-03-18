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
import { Profile } from './Profile';
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
    );
  }

  public static async create(
    name: ProfileName,
    password: Password,
    networks: NetworkId[] = [],
  ): Promise<Identity> {
    const keyPair = await KeyPair.generate();
    const encryptedKeyPair = await keyPair.encryptKeyPair(password);
    const primitives = {
      encryptedKeyPair: encryptedKeyPair.toPrimitives(),
      id: encryptedKeyPair.toPrimitives().publicKey,
      networks: networks.map((networkId) => networkId.valueOf()),
      profile: new Profile(name).toPrimitives(),
      signature: '',
      timestamp: Timestamp.now().valueOf(),
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

  public toPrimitives() {
    return {
      encryptedKeyPair: this.encryptedKeyPair.toPrimitives(),
      id: this.id.valueOf(),
      networks: this.networks.toArray().map((networkId) => networkId.valueOf()),
      profile: this.profile.toPrimitives(),
      signature: this.signature.valueOf(),
      timestamp: this.timestamp.valueOf(),
    };
  }
}
