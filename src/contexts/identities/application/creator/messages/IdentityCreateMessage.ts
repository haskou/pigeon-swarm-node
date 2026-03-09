import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { Password } from '@app/contexts/shared/domain/Password';

export class IdentityCreateMessage {
  public readonly name: ProfileName;
  public readonly password: Password;

  constructor(name: string, password: string) {
    this.name = new ProfileName(name);
    this.password = new Password(password);
  }
}
