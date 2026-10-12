/** The reader-signed request a read receipt carries as proof. Verified at the boundary, never trusted here. */
export type MessageReadProofData = {
  body: Record<string, unknown>;
  method: string;
  path: string;
  signature: string;
  timestamp: number;
};

/**
 * A read receipt whose reader-signed proof has been verified for this exact
 * conversation, message and reader. Only the boundary verifier builds one.
 */
export type MessageReadClaim = {
  conversationId: string;
  messageId: string;
  readerIdentityId: string;
  timestamp: number;
};

/**
 * Freshness window for verified read receipts. Authentic receipts are only
 * receivable inside it, which stops a captured receipt from being replayed
 * indefinitely. Late offline delivery inside the window still works. The caller
 * supplies the clock.
 */
export class MessageReadProof {
  /** Oldest receipt age still applied. Matches the mailbox retention default. */
  public static readonly MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  /** Largest lead over this node's clock still applied. Matches the HTTP replay guard. */
  public static readonly MAX_FUTURE_SKEW_MS = 30_000;

  public static isFresh(claim: MessageReadClaim, now: number): boolean {
    return (
      claim.timestamp >= now - MessageReadProof.MAX_AGE_MS &&
      claim.timestamp <= now + MessageReadProof.MAX_FUTURE_SKEW_MS
    );
  }
}
