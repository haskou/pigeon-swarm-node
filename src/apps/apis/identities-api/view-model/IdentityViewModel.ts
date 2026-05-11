import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';

import { IdentityResource } from '../resources/IdentityResource';

export class IdentityViewModel {
  constructor(
    private readonly identity: Identity,
    private readonly externalIdentifier?: IdentityExternalIdentifier,
  ) {}

  public toResource(): IdentityResource {
    return {
      ...this.identity.toPrimitives(),
      identityExternalIdentifier: this.externalIdentifier?.valueOf(),
    };
  }
}
