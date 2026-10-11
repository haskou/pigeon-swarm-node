import {
  MessageReadClaim,
  MessageReadProof,
} from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
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
    expect(
      MessageReadProof.isAuthentic({ body: {} }, claimFor(reader)),
    ).toBe(false);
  });
});
