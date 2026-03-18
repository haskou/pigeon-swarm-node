import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';

export class IdentityCreateMessage {
  public readonly name: ProfileName;
  public readonly password: Password;
  public readonly networks: NetworkId[];

  constructor(name: string, password: string, networks: string[]) {
    this.name = new ProfileName(name);
    this.password = new Password(password);
    this.networks = networks.map((network) => new NetworkId(network));
  }
}
