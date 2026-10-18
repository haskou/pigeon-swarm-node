import { CommunityRequestId } from '../../domain/value-objects/CommunityRequestId';

/**
 * Position of a membership request in its list: the fixed-width ISO-8601
 * update time, then the request id, so string order is the list order.
 */
export class CommunityMembershipRequestPosition {
  private static readonly PATTERN =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([a-zA-Z0-9]+)$/;

  public static of(updatedAt: number, requestId: string): string {
    return `${new Date(updatedAt).toISOString()}|${requestId}`;
  }

  /** Whether a position is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const match = CommunityMembershipRequestPosition.PATTERN.exec(position);

    if (!match) return false;

    const [, iso, requestId] = match;

    try {
      new CommunityRequestId(requestId);
    } catch {
      return false;
    }

    return new Date(iso).toISOString() === iso;
  }
}
