import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

export class ConversationId extends StringValueObject {
  /**
   * One-to-one id (`CommitmentId.oneToOneConversation`): it commits to both
   * participants and the network, in either order.
   */
  public static deterministic(
    first: { valueOf(): string },
    second: { valueOf(): string },
    network: { valueOf(): string },
  ): ConversationId {
    return new ConversationId(
      CommitmentId.oneToOneConversation(
        first.valueOf(),
        second.valueOf(),
        network.valueOf(),
      ),
    );
  }
}
