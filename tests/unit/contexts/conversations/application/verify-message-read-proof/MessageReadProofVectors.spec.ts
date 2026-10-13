import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { MessageReadProofVerifier } from '@app/contexts/conversations/application/verify-message-read-proof/MessageReadProofVerifier';
import { MessageReadProofVerifyMessage } from '@app/contexts/conversations/application/verify-message-read-proof/messages/MessageReadProofVerifyMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair, PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Vectors = {
  cases: {
    derived: {
      canonicalPayload: {
        bodyHash: string;
        method: string;
        path: string;
        timestamp: number;
      };
      signature: string;
      signingContent: string;
    };
    expected: {
      claim: {
        conversationId: string;
        messageId: string;
        readerIdentityId: string;
        timestamp: number;
      };
      proof: {
        body: Record<string, unknown>;
        method: string;
        path: string;
        signature: string;
        timestamp: number;
      };
    };
    input: {
      conversationId: string;
      messageId: string;
      readerIdentityId: string;
      readProof: {
        body: Record<string, unknown>;
        method: string;
        path: string;
        signature: string;
        timestamp: number;
      };
    };
    name: string;
  }[];
  key: {
    identityId: string;
    privateKeyPem: string;
    publicKeyPem: string;
    seedHex: string;
  };
  rejected: {
    input: {
      conversationId: string;
      messageId: string;
      readerIdentityId: string;
      readProof: {
        body: Record<string, unknown>;
        method: string;
        path: string;
        signature: string;
        timestamp: number;
      };
    };
    name: string;
  }[];
};

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../fixtures/message-read-proof-vectors.json'),
    'utf8',
  ),
) as Vectors;

describe('Message read proof vectors', () => {
  const verifier = new MessageReadProofVerifier();

  it('derives the fixture reader key from its documented seed', () => {
    expect(new IdentityId(vectors.key.publicKeyPem).valueOf()).toBe(
      vectors.key.identityId,
    );
    expect(vectors.key.seedHex).toBe(
      createHash('sha256')
        .update('pigeon-vector:message-read-proof:reader', 'utf8')
        .digest('hex'),
    );
  });

  describe('canonical form', () => {
    it.each(vectors.cases)(
      'pins the canonical payload of $name',
      ({ derived, input }) => {
        const canonicalPayload =
          new SignedHttpRequestVerifier().getCanonicalPayload(
            input.readProof.method,
            input.readProof.path,
            input.readProof.timestamp,
            input.readProof.body,
          );

        expect(canonicalPayload).toEqual(derived.canonicalPayload);
        expect(JSON.stringify(canonicalPayload)).toBe(derived.signingContent);
      },
    );
  });

  describe('signature', () => {
    it.each(vectors.cases)(
      'signs $name deterministically and verifies',
      ({ derived }) => {
        const signer = KeyPair.fromPrimitives({
          privateKey: vectors.key.privateKeyPem,
          publicKey: vectors.key.publicKeyPem,
        });

        expect(signer.sign(derived.signingContent).valueOf()).toBe(
          derived.signature,
        );
        expect(
          new PublicKey(vectors.key.publicKeyPem).isValidSignature(
            derived.signingContent,
            new Signature(derived.signature),
          ),
        ).toBe(true);
      },
    );
  });

  describe('verifier', () => {
    it.each(vectors.cases)(
      'verifies $name and returns its claim and proof',
      ({ expected, input }) => {
        const verified = verifier.verify(
          new MessageReadProofVerifyMessage(
            input.conversationId,
            input.readerIdentityId,
            input.messageId,
            input.readProof,
          ),
        );

        expect(verified).toEqual(expected);
      },
    );

    it.each(vectors.rejected)(
      'rejects a read proof whose $name',
      ({ input }) => {
        expect(
          verifier.verify(
            new MessageReadProofVerifyMessage(
              input.conversationId,
              input.readerIdentityId,
              input.messageId,
              input.readProof,
            ),
          ),
        ).toBeUndefined();
      },
    );
  });
});
