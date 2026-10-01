import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';

export class IdentityPublishMessage {
  public readonly identity: Identity;

  constructor(primitives: IdentityPrimitives) {
    this.identity = Identity.fromSignedPublication(primitives);
  }
}
