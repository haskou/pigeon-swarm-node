import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { canonicalSignedRequestPayload } from '@app/contexts/shared/domain/value-objects/SignedRequestPayload';
import { PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';

export type MessageReadProofData = {
  body: Record<string, unknown>;
  method: string;
  path: string;
  signature: string;
  timestamp: number;
};

export type MessageReadClaim = {
  conversationId: string;
  messageId: string;
  readerIdentityId: string;
};

/**
 * Proves a read receipt was signed by the reader's identity key for this exact
 * conversation and message. Receipts without a valid proof are not authentic
 * and must neither change read state nor reach clients. Authentic receipts are
 * only receivable inside a freshness window, which stops a captured receipt
 * from being replayed indefinitely. Late offline delivery inside the window
 * still works.
 *
 * The signed path is `request.path`, so it carries any configured
 * `ROUTE_PREFIX` before `/conversations`.
 *
 * The signed bytes come from the same canonicalizer SignedHttpRequestVerifier
 * uses for `PUT .../messages/read-until`, so the proof and the HTTP request it
 * was taken from always agree.
 */
export class MessageReadProof {
  private static readonly READ_UNTIL_PATH =
    /^(?:\/[^/]+)*\/conversations\/([^/]+)\/messages\/read-until$/;

  /** Oldest receipt age still applied. Matches the mailbox retention default. */
  public static readonly MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  /** Largest lead over this node's clock still applied. Matches the HTTP replay guard. */
  public static readonly MAX_FUTURE_SKEW_MS = 30_000;

  private static hasShape(value: unknown): value is MessageReadProofData {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    const body = candidate.body;

    return (
      typeof body === 'object' &&
      body !== null &&
      typeof candidate.method === 'string' &&
      typeof candidate.path === 'string' &&
      typeof candidate.signature === 'string' &&
      Number.isInteger(candidate.timestamp)
    );
  }

  private static isFresh(timestamp: number, now = Date.now()): boolean {
    return (
      timestamp >= now - MessageReadProof.MAX_AGE_MS &&
      timestamp <= now + MessageReadProof.MAX_FUTURE_SKEW_MS
    );
  }

  public static isAuthentic(
    value: unknown,
    claim: MessageReadClaim,
  ): value is MessageReadProofData {
    if (!MessageReadProof.hasShape(value)) {
      return false;
    }

    try {
      const match = MessageReadProof.READ_UNTIL_PATH.exec(value.path);

      if (
        !match ||
        decodeURIComponent(match[1]) !== claim.conversationId ||
        value.method !== 'PUT' ||
        value.body.messageId !== claim.messageId
      ) {
        return false;
      }

      const payload = canonicalSignedRequestPayload(
        value.method,
        value.path,
        value.timestamp,
        value.body,
      );
      const readerKey = PublicKey.fromPEM(
        new IdentityId(claim.readerIdentityId).toString(),
      );

      return readerKey.isValidSignature(
        JSON.stringify(payload),
        new Signature(value.signature),
      );
    } catch {
      return false;
    }
  }

  public static isReceivable(
    value: unknown,
    claim: MessageReadClaim,
    now = Date.now(),
  ): value is MessageReadProofData {
    return (
      MessageReadProof.isAuthentic(value, claim) &&
      MessageReadProof.isFresh(value.timestamp, now)
    );
  }
}
