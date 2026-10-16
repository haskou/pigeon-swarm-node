import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

import { NodeRegistrationCodeIsNotValidError } from '../errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationCodeHash } from './NodeRegistrationCodeHash';

/** The registration code itself, a bearer capability. Never stored. */
export class NodeRegistrationCodeSecret extends StringValueObject {
  public static generate(): NodeRegistrationCodeSecret {
    return new NodeRegistrationCodeSecret(BearerCapability.generate().token);
  }

  /** A malformed code cannot match any issued one, so it is not valid. */
  public hash(): NodeRegistrationCodeHash {
    try {
      return new NodeRegistrationCodeHash(
        BearerCapability.hash(this.valueOf()),
      );
    } catch {
      throw new NodeRegistrationCodeIsNotValidError();
    }
  }
}
