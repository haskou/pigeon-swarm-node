import { ShortId, StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class ConversationId extends StringValueObject {
  public static group(): ConversationId {
    return new ConversationId(`group:${ShortId.generate().valueOf()}`);
  }

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
}
