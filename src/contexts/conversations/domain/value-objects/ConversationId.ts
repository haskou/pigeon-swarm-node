import { StringValueObject } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

export class ConversationId extends StringValueObject {
  public static deterministic(
    first: { valueOf(): string },
    second: { valueOf(): string },
    network: { valueOf(): string },
  ): ConversationId {
    const [firstParticipant, secondParticipant] = [
      first.valueOf(),
      second.valueOf(),
    ].sort();
    const hash = createHash('sha256')
      .update(`${firstParticipant}:${secondParticipant}:${network.valueOf()}`)
      .digest('hex');

    return new ConversationId(`one-to-one:${hash}`);
  }

  /**
   * Genesis-bound group id: `group:` + base64url(sha256(canonicalize({
   * creatorIdentityId, networkId, nonce}))). The id commits to the network and
   * the creator, so nobody can claim an existing group id with another creator.
   */
  public static deriveGroup(
    networkId: string,
    creatorIdentityId: string,
    nonce: string,
  ): ConversationId {
    const hash = createHash('sha256')
      .update(canonicalize({ creatorIdentityId, networkId, nonce }) as string)
      .digest('base64url');

    return new ConversationId(`group:${hash}`);
  }
}
