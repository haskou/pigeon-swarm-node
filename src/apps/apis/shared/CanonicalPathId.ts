import { NotFoundError } from 'routing-controllers';

/**
 * Shape guards for ids that arrive in a URL path, applied before any lookup.
 * A segment that is not the canonical encoding of an id can name no resource,
 * so it is refused as not found instead of reaching a finder: a removed
 * verb-style path that still matches `/:id` (`/communities/discover`,
 * `/calls/history`, `/calls/ice-servers`) never touches the stores.
 */
export class CanonicalPathId {
  /** Genesis-bound community id: unpadded base64url of a SHA-256 digest. */
  private static readonly COMMUNITY = /^[A-Za-z0-9_-]{43}$/;

  /** Call id derived from the creator and a nonce: a lowercase UUID. */
  private static readonly CALL =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  public static community(raw: string): string {
    if (!CanonicalPathId.COMMUNITY.test(raw)) {
      throw new NotFoundError('Community not found.');
    }

    return raw;
  }

  public static call(raw: string): string {
    if (!CanonicalPathId.CALL.test(raw)) {
      throw new NotFoundError('Call not found.');
    }

    return raw;
  }
}
