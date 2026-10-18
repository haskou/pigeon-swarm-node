import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { DatedConversation } from '../../domain/DatedConversation';
import { ConversationId } from '../../domain/value-objects/ConversationId';

/**
 * The page position of a conversation: when it was created, then its id, so
 * conversations created in the same millisecond keep a stable order. Newest
 * first.
 */
export class ConversationPosition {
  private static readonly SEPARATOR = '|';

  public static of(dated: DatedConversation): string {
    const { id } = dated.conversation.toPrimitives();

    return `${PageTimestamp.of(dated.createdAt)}${ConversationPosition.SEPARATOR}${id}`;
  }

  /** Whether `position` is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const separator = position.indexOf(ConversationPosition.SEPARATOR);

    if (separator === -1 || separator === position.length - 1) return false;

    try {
      new ConversationId(position.slice(separator + 1));
    } catch {
      return false;
    }

    return PageTimestamp.isValid(position.slice(0, separator));
  }
}
