import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { CommunityRequestId } from '../../domain/value-objects/CommunityRequestId';

/**
 * Position of a membership request in its list: the fixed-width update time,
 * then the request id, so string order is the list order.
 */
export class CommunityMembershipRequestPosition {
  private static readonly PATTERN = /^(\d{17})\|([a-zA-Z0-9]+)$/;

  public static of(updatedAt: number, requestId: string): string {
    return `${PageTimestamp.of(updatedAt)}|${requestId}`;
  }

  /** Whether a position is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const match = CommunityMembershipRequestPosition.PATTERN.exec(position);

    if (!match) return false;

    const [, timestamp, requestId] = match;

    if (!PageTimestamp.isValid(timestamp)) return false;

    try {
      new CommunityRequestId(requestId);
    } catch {
      return false;
    }

    return true;
  }
}
