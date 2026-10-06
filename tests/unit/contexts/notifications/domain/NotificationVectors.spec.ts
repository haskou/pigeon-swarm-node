import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import canonicalize from 'canonicalize';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Vector {
  derived: {
    idPreimage?: string;
    mutation: Record<string, unknown>;
    mutationBody: Record<string, unknown>;
    payload: Record<string, unknown> & { id: string };
    payloadCanonical: string;
    payloadDigest: string;
    signature: string;
    signingContent: string;
  };
  name: string;
}

interface Vectors {
  cases: Vector[];
  keys: Record<string, { identityId: string; publicKeyPem: string }>;
}

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../fixtures/notification-vectors.json'),
    'utf8',
  ),
) as Vectors;
const digestOfText = (value: string): string =>
  createHash('sha256').update(value).digest('base64url');

describe('Notification vectors', () => {
  it.each(vectors.cases.map((vector) => [vector.name, vector] as const))(
    '%s is byte exact',
    (_name, vector) => {
      const { derived } = vector;
      const author = (derived.mutationBody.author as { identityId: string })
        .identityId;
      const signer = Object.values(vectors.keys).find(
        (key) => key.identityId === author,
      )!;

      expect(canonicalize(derived.payload)).toBe(derived.payloadCanonical);
      expect(digestOfText(derived.payloadCanonical)).toBe(
        derived.payloadDigest,
      );
      expect(PublicMutationProof.digestOf(derived.payload)).toBe(
        derived.payloadDigest,
      );
      expect(derived.mutationBody.payloadDigest).toBe(derived.payloadDigest);
      expect(derived.mutationBody.recordId).toBe(derived.payload.id);
      expect(
        PublicMutationProof.signingContentOf(derived.mutationBody as never),
      ).toBe(derived.signingContent);
      expect(
        verify(
          null,
          Buffer.from(derived.signingContent),
          createPublicKey(signer.publicKeyPem),
          Buffer.from(derived.signature, 'base64'),
        ),
      ).toBe(true);
      expect(derived.mutation).toEqual({
        ...derived.mutationBody,
        signature: derived.signature,
      });

      if (derived.idPreimage) {
        const payload = derived.payload as Record<string, string>;

        expect(
          canonicalize({
            inviterIdentityId: payload.inviterIdentityId,
            nonce: payload.nonce,
            recipientIdentityId: payload.recipientIdentityId,
            subjectId: payload.subjectId,
          }),
        ).toBe(derived.idPreimage);
        expect(
          NotificationId.invitation(
            payload.inviterIdentityId,
            payload.recipientIdentityId,
            payload.subjectId,
            payload.nonce,
          ).valueOf(),
        ).toBe(derived.payload.id);
        expect(derived.payload.id).toBe(
          `invitation:${createHash('sha256').update(derived.idPreimage).digest('hex')}`,
        );
      }
    },
  );
});
