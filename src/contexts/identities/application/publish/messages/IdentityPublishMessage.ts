import { Identity } from '@app/contexts/identities/domain/Identity';
import { PrimitiveOf } from '@haskou/value-objects';

export class IdentityPublishMessage {
  public readonly identity: Identity;

  constructor(
    primitives: Omit<PrimitiveOf<Identity>, 'masterKeyDerivation'> & {
      masterKeyDerivation: Record<string, unknown>;
    },
  ) {
    this.identity = Identity.fromSignedPublication(primitives);
  }
}
