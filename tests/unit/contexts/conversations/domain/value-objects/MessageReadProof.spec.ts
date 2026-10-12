import {
  MessageReadClaim,
  MessageReadProof,
} from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  SignedHttpRequest,
  SignedHttpRequestVerifier,
} from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { signedReadReceipt } from '../../support/signedReadReceipt';

describe('MessageReadProof', () => {
  const conversationId = 'one-to-one:conversation-1';
  const messageId = 'message-1';

  function claimFor(
    keyPair: KeyPair,
    overrides: Partial<MessageReadClaim> = {},
  ): MessageReadClaim {
    return {
      conversationId,
      messageId,
      readerIdentityId: keyPair.toPrimitives().publicKey,
      ...overrides,
    };
  }

  it('accepts a receipt its reader signed for this conversation and message', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    expect(MessageReadProof.isAuthentic(proof, claimFor(reader))).toBe(true);
  });

  it('accepts a receipt signed under a configured ROUTE_PREFIX', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
      pathPrefix: '/api',
    });

    expect(MessageReadProof.isAuthentic(proof, claimFor(reader))).toBe(true);
  });

  it('accepts exactly the signed request the HTTP verifier accepts', async () => {
    const reader = await KeyPair.generate();
    const timestamp = Date.now();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
      timestamp,
    });
    const identityId = new IdentityId(
      reader.toPrimitives().publicKey,
    ).valueOf();
    const headers: Record<string, string> = {
      'x-identity-id': identityId,
      'x-signature': proof.signature,
      'x-timestamp': String(timestamp),
    };
    const request: SignedHttpRequest = {
      body: proof.body,
      header: (name) => headers[name],
      method: proof.method,
      path: proof.path,
    };

    expect(new SignedHttpRequestVerifier().verify(request).valueOf()).toBe(
      identityId,
    );
    expect(MessageReadProof.isAuthentic(proof, claimFor(reader))).toBe(true);
  });

  it('rejects a receipt signed for another message', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId: 'message-2',
    });

    expect(MessageReadProof.isAuthentic(proof, claimFor(reader))).toBe(false);
  });

  it('rejects a receipt replayed into another conversation', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    expect(
      MessageReadProof.isAuthentic(
        proof,
        claimFor(reader, { conversationId: 'one-to-one:conversation-2' }),
      ),
    ).toBe(false);
  });

  it('rejects a receipt claimed for a reader who did not sign it', async () => {
    const signer = await KeyPair.generate();
    const other = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: signer,
      messageId,
    });

    expect(MessageReadProof.isAuthentic(proof, claimFor(other))).toBe(false);
  });

  it('rejects a receipt whose timestamp was altered after signing', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    expect(
      MessageReadProof.isAuthentic(
        { ...proof, timestamp: proof.timestamp + 1 },
        claimFor(reader),
      ),
    ).toBe(false);
  });

  it('rejects a missing or malformed proof', async () => {
    const reader = await KeyPair.generate();

    expect(MessageReadProof.isAuthentic(undefined, claimFor(reader))).toBe(
      false,
    );
    expect(MessageReadProof.isAuthentic({ body: {} }, claimFor(reader))).toBe(
      false,
    );
  });

  describe('isReceivable', () => {
    const now = Date.UTC(2026, 5, 10, 12);
    const day = 24 * 60 * 60 * 1000;

    it('accepts a receipt signed inside the freshness window so late offline delivery still works', async () => {
      const reader = await KeyPair.generate();
      const proof = await signedReadReceipt({
        conversationId,
        keyPair: reader,
        messageId,
        timestamp: now - 13 * day,
      });

      expect(MessageReadProof.isReceivable(proof, claimFor(reader), now)).toBe(
        true,
      );
    });

    it('rejects an authentic receipt signed before the freshness window', async () => {
      const reader = await KeyPair.generate();
      const proof = await signedReadReceipt({
        conversationId,
        keyPair: reader,
        messageId,
        timestamp: now - MessageReadProof.MAX_AGE_MS - 1,
      });

      expect(MessageReadProof.isAuthentic(proof, claimFor(reader))).toBe(true);
      expect(MessageReadProof.isReceivable(proof, claimFor(reader), now)).toBe(
        false,
      );
    });

    it('accepts a receipt dated at most the clock skew ahead of now', async () => {
      const reader = await KeyPair.generate();
      const proof = await signedReadReceipt({
        conversationId,
        keyPair: reader,
        messageId,
        timestamp: now + MessageReadProof.MAX_FUTURE_SKEW_MS,
      });

      expect(MessageReadProof.isReceivable(proof, claimFor(reader), now)).toBe(
        true,
      );
    });

    it('rejects a receipt dated beyond the clock skew ahead of now', async () => {
      const reader = await KeyPair.generate();
      const proof = await signedReadReceipt({
        conversationId,
        keyPair: reader,
        messageId,
        timestamp: now + MessageReadProof.MAX_FUTURE_SKEW_MS + 1,
      });

      expect(MessageReadProof.isReceivable(proof, claimFor(reader), now)).toBe(
        false,
      );
    });
  });
});
