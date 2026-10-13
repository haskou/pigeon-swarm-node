import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNodeCommunityStateDigestError } from '../errors/InvalidNodeCommunityStateDigestError';

/**
 * Opaque base64url SHA-256 digest of the community state a node holds for one
 * network. Equal digests mean equal state; the digest reveals nothing else.
 */
export class NodeCommunityStateDigest extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      /^[A-Za-z0-9_-]{43}$/.test(this.valueOf()),
      new InvalidNodeCommunityStateDigestError(),
    );
  }
}
