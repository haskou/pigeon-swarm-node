import { StringValueObject } from '@haskou/value-objects';
import { createHash, randomBytes } from 'crypto';

import { NodeRegistrationCodeHash } from './NodeRegistrationCodeHash';

/** The registration code itself: 32 random bytes, base64url. Never stored. */
export class NodeRegistrationCodeSecret extends StringValueObject {
  private static readonly BYTES = 32;

  public static generate(): NodeRegistrationCodeSecret {
    return new NodeRegistrationCodeSecret(
      randomBytes(NodeRegistrationCodeSecret.BYTES).toString('base64url'),
    );
  }

  public hash(): NodeRegistrationCodeHash {
    return new NodeRegistrationCodeHash(
      createHash('sha256').update(this.valueOf(), 'utf8').digest('hex'),
    );
  }
}
