import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityId extends StringValueObject {
  /**
   * Genesis-bound id. It commits to the network and the owner, so nobody can
   * claim an existing community id with a different owner.
   */
  public static derive(
    networkId: string,
    ownerIdentityId: string,
    nonce: string,
  ): CommunityId {
    return new CommunityId(
      CommitmentId.community(networkId, ownerIdentityId, nonce),
    );
  }

  public static generate(): CommunityId {
    return new CommunityId(ShortId.generate().valueOf());
  }
}
