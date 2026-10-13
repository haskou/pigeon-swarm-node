import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
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
    headers: Record<string, string>;
    input: {
      body?: unknown;
      bodyBase64?: string;
      method: string;
      path: string;
      timestamp: number;
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
    headers: Record<string, string>;
    input: {
      body?: unknown;
      bodyBase64?: string;
      method: string;
      path: string;
      timestamp: number;
    };
    name: string;
  }[];
};

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../fixtures/signed-http-request-vectors.json'),
    'utf8',
  ),
) as Vectors;

const requestBody = (input: Vectors['cases'][number]['input']): unknown =>
  input.bodyBase64 === undefined
    ? input.body
    : Buffer.from(input.bodyBase64, 'base64');

describe('Signed HTTP request vectors', () => {
  const verifier = new SignedHttpRequestVerifier();

  it('derives the fixture key from its documented seed', () => {
    expect(new IdentityId(vectors.key.publicKeyPem).valueOf()).toBe(
      vectors.key.identityId,
    );
    expect(vectors.key.seedHex).toBe(
      createHash('sha256')
        .update('pigeon-vector:signed-http-request:client', 'utf8')
        .digest('hex'),
    );
  });

  describe('canonical form', () => {
    it.each(vectors.cases)(
      'pins the canonical payload of $name',
      ({ derived, input }) => {
        const canonicalPayload = verifier.getCanonicalPayload(
          input.method,
          input.path,
          input.timestamp,
          requestBody(input),
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
      'accepts $name and returns the signer and timestamp',
      ({ headers, input }) => {
        const result = verifier.verifySignature({
          body: requestBody(input),
          header: (name: string) => headers[name],
          method: input.method,
          path: input.path,
        });

        expect(result.identityId.valueOf()).toBe(vectors.key.identityId);
        expect(result.timestamp).toBe(headers['x-timestamp']);
      },
    );

    it.each(vectors.rejected)(
      'rejects a request whose $name',
      ({ headers, input }) => {
        expect(() =>
          verifier.verifySignature({
            body: requestBody(input),
            header: (name: string) => headers[name],
            method: input.method,
            path: input.path,
          }),
        ).toThrow(InvalidSignedRequestError);
      },
    );
  });
});
