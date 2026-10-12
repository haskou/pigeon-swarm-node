import {
  MessageReadClaim,
  MessageReadProofData,
} from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { canonicalSignedRequestPayload } from '@app/contexts/shared/domain/value-objects/SignedRequestPayload';
import { PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';

import { MessageReadProofVerifyMessage } from './messages/MessageReadProofVerifyMessage';

/** An authentic read receipt proof, narrowed, with the claim it was verified for. */
export type VerifiedMessageReadProof = {
  claim: MessageReadClaim;
  proof: MessageReadProofData;
};

/**
 * Verifies that a read receipt's proof is the reader's own signed
 * `PUT .../conversations/<id>/messages/read-until` request for the claimed
 * conversation, message and reader. Returns the verified proof and its claim,
 * or undefined when the proof is not authentic. Freshness is the domain's
 * concern and is applied by the caller.
 */
export class MessageReadProofVerifier {
  private static readonly READ_UNTIL_PATH =
    /^(?:\/[^/]+)*\/conversations\/([^/]+)\/messages\/read-until$/;

  private static hasShape(value: unknown): value is MessageReadProofData {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      typeof candidate.body === 'object' &&
      candidate.body !== null &&
      typeof candidate.method === 'string' &&
      typeof candidate.path === 'string' &&
      typeof candidate.signature === 'string' &&
      Number.isInteger(candidate.timestamp)
    );
  }

  public verify(
    message: MessageReadProofVerifyMessage,
  ): VerifiedMessageReadProof | undefined {
    if (!MessageReadProofVerifier.hasShape(message.readProof)) {
      return undefined;
    }

    const proof = message.readProof;

    try {
      const match = MessageReadProofVerifier.READ_UNTIL_PATH.exec(proof.path);

      if (
        !match ||
        decodeURIComponent(match[1]) !== message.conversationId ||
        proof.method !== 'PUT' ||
        proof.body.messageId !== message.messageId
      ) {
        return undefined;
      }

      const payload = canonicalSignedRequestPayload(
        proof.method,
        proof.path,
        proof.timestamp,
        proof.body,
      );
      const readerKey = PublicKey.fromPEM(
        new IdentityId(message.readerIdentityId).toString(),
      );

      if (
        !readerKey.isValidSignature(
          JSON.stringify(payload),
          new Signature(proof.signature),
        )
      ) {
        return undefined;
      }

      return {
        claim: {
          conversationId: message.conversationId,
          messageId: message.messageId,
          readerIdentityId: message.readerIdentityId,
          timestamp: proof.timestamp,
        },
        proof,
      };
    } catch {
      return undefined;
    }
  }
}
