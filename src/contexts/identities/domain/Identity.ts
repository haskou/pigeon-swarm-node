import { IdentityId } from '@app/contexts/shared/domain/IdentityId';
import { Password } from '@app/contexts/shared/domain/Password';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import {
  assert,
  EncryptedKeyPair,
  KeyPair,
  PrimitiveOf,
  Signature,
  Timestamp,
} from '@haskou/value-objects';

import { IdentitySignatureDomainService } from './domain-services/IdentitySignatureDomainService';
import { Profile } from './Profile';
import { ProfileName } from './value-objects/ProfileName';

// TODO: Test
export class Identity extends AggregateRoot {
  public static fromPrimitives(primitives: PrimitiveOf<Identity>): Identity {
    return new Identity(
      new IdentityId(primitives.id),
      EncryptedKeyPair.fromPrimitives(primitives.encryptedKeyPair),
      Profile.fromPrimitives(primitives.profile),
      new Timestamp(primitives.timestamp),
      new Signature(primitives.signature),
    );
  }

  public static async create(
    name: ProfileName,
    password: Password,
  ): Promise<Identity> {
    const keyPair = await KeyPair.generate();
    const encryptedKeyPair = await keyPair.encryptKeyPair(password);
    const primitives = {
      encryptedKeyPair: encryptedKeyPair.toPrimitives(),
      id: IdentityId.generate().valueOf(),
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

    // TODO: Add event
    return identity;
  }

  constructor(
    private readonly id: IdentityId,
    private encryptedKeyPair: EncryptedKeyPair,
    private profile: Profile,
    private timestamp: Timestamp,
    private signature: Signature,
  ) {
    super();

    // TODO: Add error
    assert(
      new IdentitySignatureDomainService().isValidSignature(
        this.encryptedKeyPair,
        this.toPrimitives(),
        this.signature,
      ),
      'Invalid signature for the provided identity data.',
    );
  }

  public toPrimitives() {
    return {
      encryptedKeyPair: this.encryptedKeyPair.toPrimitives(),
      id: this.id.valueOf(),
      profile: this.profile.toPrimitives(),
      signature: this.signature.valueOf(),
      timestamp: this.timestamp.valueOf(),
    };
  }
}
