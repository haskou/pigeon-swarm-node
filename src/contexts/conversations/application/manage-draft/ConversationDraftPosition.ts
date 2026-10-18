import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { ConversationDraft } from '../../domain/ConversationDraft';

/**
 * The page position of a draft: its last update, then its draft key, so drafts
 * saved in the same millisecond keep a stable order. Newest first.
 */
export class ConversationDraftPosition {
  private static readonly PATTERN = /^(\d{17})\|[A-Za-z0-9_-]{43}$/;

  public static of(draft: ConversationDraft): string {
    return `${PageTimestamp.of(draft.getUpdatedAt().valueOf())}|${draft.getDraftKey().valueOf()}`;
  }

  /** Whether `position` is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const match = ConversationDraftPosition.PATTERN.exec(position);

    return match !== null && PageTimestamp.isValid(match[1]);
  }
}
