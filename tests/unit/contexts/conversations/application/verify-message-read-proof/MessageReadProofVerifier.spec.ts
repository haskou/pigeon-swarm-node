import {
  SignedHttpRequest,
  SignedHttpRequestVerifier,
} from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { MessageReadProofVerifier } from '@app/contexts/conversations/application/verify-message-read-proof/MessageReadProofVerifier';
import { MessageReadProofVerifyMessage } from '@app/contexts/conversations/application/verify-message-read-proof/messages/MessageReadProofVerifyMessage';
import { MessageReadClaim } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { signedReadReceipt } from '../../support/signedReadReceipt';

describe('MessageReadProofVerifier', () => {
  const conversationId = 'one-to-one:conversation-1';
  const messageId = 'message-1';
  const verifier = new MessageReadProofVerifier();

  function messageFor(
    readProof: unknown,
    reader: KeyPair,
    overrides: {
      conversationId?: string;
      messageId?: string;
      readerIdentityId?: string;
    } = {},
  ): MessageReadProofVerifyMessage {
    const claimed = {
      conversationId,
      messageId,
      readerIdentityId: reader.toPrimitives().publicKey,
      ...overrides,
    };

    return new MessageReadProofVerifyMessage(
      claimed.conversationId,
      claimed.readerIdentityId,
      claimed.messageId,
      readProof,
    );
  }

  function verifiedClaim(reader: KeyPair, timestamp: number): MessageReadClaim {
    return {
      conversationId,
      messageId,
      readerIdentityId: reader.toPrimitives().publicKey,
      timestamp,
    };
  }

  it('returns the claim and the same proof for a receipt its reader signed for this conversation and message', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    const verified = verifier.verify(messageFor(proof, reader));

    expect(verified?.claim).toEqual(verifiedClaim(reader, proof.timestamp));
    expect(verified?.proof).toBe(proof);
  });

  it('accepts a receipt signed under a configured ROUTE_PREFIX', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
      pathPrefix: '/api',
    });

    expect(verifier.verify(messageFor(proof, reader))?.claim).toEqual(
      verifiedClaim(reader, proof.timestamp),
    );
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
    expect(verifier.verify(messageFor(proof, reader))?.claim).toEqual(
      verifiedClaim(reader, timestamp),
    );
  });

  it('rejects a receipt signed for another message', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId: 'message-2',
    });

    expect(verifier.verify(messageFor(proof, reader))).toBeUndefined();
  });

  it('rejects a receipt replayed into another conversation', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    expect(
      verifier.verify(
        messageFor(proof, reader, {
          conversationId: 'one-to-one:conversation-2',
        }),
      ),
    ).toBeUndefined();
  });

  it('rejects a receipt claimed for a reader who did not sign it', async () => {
    const signer = await KeyPair.generate();
    const other = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: signer,
      messageId,
    });

    expect(verifier.verify(messageFor(proof, other))).toBeUndefined();
  });

  it('rejects a receipt whose timestamp was altered after signing', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    expect(
      verifier.verify(
        messageFor({ ...proof, timestamp: proof.timestamp + 1 }, reader),
      ),
    ).toBeUndefined();
  });

  it('rejects a missing or malformed proof', async () => {
    const reader = await KeyPair.generate();

    expect(verifier.verify(messageFor(undefined, reader))).toBeUndefined();
    expect(verifier.verify(messageFor({ body: {} }, reader))).toBeUndefined();
  });

  it('rejects a reader identity that is not a valid key without throwing', async () => {
    const reader = await KeyPair.generate();
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
    });

    expect(
      verifier.verify(
        messageFor(proof, reader, { readerIdentityId: 'not-a-key' }),
      ),
    ).toBeUndefined();
  });

  it('returns the claim for an authentic receipt of any age, leaving freshness to the domain', async () => {
    const reader = await KeyPair.generate();
    const timestamp = Date.UTC(2020, 0, 1);
    const proof = await signedReadReceipt({
      conversationId,
      keyPair: reader,
      messageId,
      timestamp,
    });

    expect(verifier.verify(messageFor(proof, reader))?.claim).toEqual(
      verifiedClaim(reader, timestamp),
    );
  });
});
