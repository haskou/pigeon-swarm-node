import { ShortId, StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

type DeterministicConversationIdSource = {
  valueOf(): string;
};

export class ConversationId extends StringValueObject {
  public static group(): ConversationId {
    return new ConversationId(`group:${ShortId.generate().valueOf()}`);
  }

  public static deterministic(
    first: DeterministicConversationIdSource,
    second: DeterministicConversationIdSource,
    network: DeterministicConversationIdSource,
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
