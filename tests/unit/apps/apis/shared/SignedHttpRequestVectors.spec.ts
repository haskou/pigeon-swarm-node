import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/signed-http-request.json';

type VectorInput = {
  body?: unknown;
  bodyBase64?: string;
  method: string;
  path: string;
  timestamp: number;
};

const requestOf = (
  input: VectorInput,
  headers: Record<string, string>,
): Parameters<SignedHttpRequestVerifier['verifySignature']>[0] => ({
  body:
    input.bodyBase64 === undefined
      ? input.body
      : Buffer.from(input.bodyBase64, 'base64'),
  header: (name: string) => headers[name],
  method: input.method,
  path: input.path,
});

describe('Signed HTTP request vectors', () => {
  const verifier = new SignedHttpRequestVerifier();

  it.each(vectors.cases)(
    'derives the library signing content of $name',
    ({ derived, headers, input }) => {
      expect(
        verifier.signingContent(
          requestOf(input, headers),
          headers['x-timestamp'],
        ),
      ).toBe(derived.signingContent);
    },
  );

  it.each(vectors.cases)(
    'accepts $name and returns the signer and timestamp',
    ({ headers, input }) => {
      const result = verifier.verifySignature(requestOf(input, headers));

      expect(result.identityId.valueOf()).toBe(vectors.key.identityId);
      expect(result.timestamp).toBe(headers['x-timestamp']);
    },
  );

  it.each(vectors.rejected)(
    'rejects a request whose $name',
    ({ headers, input }) => {
      expect(() =>
        verifier.verifySignature(
          requestOf(input, headers as Record<string, string>),
        ),
      ).toThrow(InvalidSignedRequestError);
    },
  );
});
