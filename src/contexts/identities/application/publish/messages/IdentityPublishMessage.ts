import { Identity } from '@app/contexts/identities/domain/Identity';
import { PrimitiveOf } from '@haskou/value-objects';

export class IdentityPublishMessage {
  public readonly identity: Identity;

  constructor(primitives: PrimitiveOf<Identity>) {
    this.identity = Identity.fromSignedPublication(primitives);
  }
}
