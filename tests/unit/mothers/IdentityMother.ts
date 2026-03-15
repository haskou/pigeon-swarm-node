import { Identity } from '@app/contexts/identities/domain/Identity';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { PrimitiveOf } from '@haskou/value-objects';
import { faker } from '@faker-js/faker';

import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';

export class IdentityMother {
  public name: ProfileName = new ProfileName(
    faker.person.firstName().substring(0, 20),
  );
  public password: Password = new Password(faker.internet.password({ length: 12 }));

  public withName(name: ProfileName): this {
    this.name = name;

    return this;
  }

  public withPassword(password: Password): this {
    this.password = password;

    return this;
  }

  public async build(): Promise<Identity> {
    return Identity.create(this.name, this.password);
  }

  public buildFromPrimitives(primitives: PrimitiveOf<Identity>): Identity {
    return Identity.fromPrimitives(primitives);
  }
}
