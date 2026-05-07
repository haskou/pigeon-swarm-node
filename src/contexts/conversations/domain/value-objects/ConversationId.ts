import { StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class ConversationId extends StringValueObject {
  public static deterministic(first: string, second: string): ConversationId {
    const [firstParticipant, secondParticipant] = [first, second].sort();
    const hash = createHash('sha256')
      .update(`${firstParticipant}:${secondParticipant}`)
      .digest('hex');

    return new ConversationId(`one-to-one:${hash}`);
  }
}
