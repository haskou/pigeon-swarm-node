import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import canonicalize from 'canonicalize';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Vector {
  derived: {
    callIdPreimage?: string;
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
    join(__dirname, '../../../../fixtures/call-event-vectors.json'),
    'utf8',
  ),
) as Vectors;
const digestOfText = (value: string): string =>
  createHash('sha256').update(value).digest('base64url');

describe('Call event vectors', () => {
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

      if (derived.callIdPreimage) {
        const payload = derived.payload as Record<string, string>;

        expect(derived.callIdPreimage).toBe(
          `${payload.creatorIdentityId}:${payload.nonce}`,
        );
        expect(
          CallId.fromStart(
            new IdentityId(payload.creatorIdentityId),
            new CallNonce(payload.nonce),
          ).valueOf(),
        ).toBe(payload.callId);
        expect(derived.payload.id).toBe(`call:${payload.callId}`);
      }
    },
  );

  it('chains a later participant state on the digest of the previous mutation', () => {
    const joined = vectors.cases.find(
      (vector) => vector.name === 'call_participant_joined',
    )!.derived;
    const left = vectors.cases.find(
      (vector) => vector.name === 'call_participant_left_after_joined',
    )!.derived;

    expect(left.mutationBody.sequence).toBe(1);
    expect(left.mutationBody.predecessor).toBe(
      PublicMutationProof.digestOf(joined.mutation),
    );
    expect(left.payload.id).toBe(joined.payload.id);
  });
});
