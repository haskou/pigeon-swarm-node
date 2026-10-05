import { ShortId, StringValueObject } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

export class CommunityId extends StringValueObject {
  /**
   * Genesis-bound id: base64url(sha256(canonicalize({networkId, nonce,
   * ownerIdentityId}))). The id commits to the network and the owner, so
   * nobody can claim an existing community id with a different owner.
   */
  public static derive(
    networkId: string,
    ownerIdentityId: string,
    nonce: string,
  ): CommunityId {
    return new CommunityId(
      createHash('sha256')
        .update(canonicalize({ networkId, nonce, ownerIdentityId }) as string)
        .digest('base64url'),
    );
  }

  public static generate(): CommunityId {
    return new CommunityId(ShortId.generate().valueOf());
  }
}
