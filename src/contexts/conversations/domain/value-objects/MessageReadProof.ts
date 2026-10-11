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
 * and must neither change read state nor reach clients.
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
}
