import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityResource } from '../resources/IdentityResource';

export class IdentityViewModel {
  constructor(private readonly identity: Identity) {}

  public toResource(): IdentityResource {
    return this.identity.toPrimitives();
  }
}
