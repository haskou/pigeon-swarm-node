import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import {
  SignedHttpRequest,
  SignedHttpRequestVerifier,
} from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';

/** A GET signed by `keyPair` whose `X-Identity-Id` names `headerIdentityId`. */
function buildSignedRequest(
  keyPair: KeyPair,
  headerIdentityId: IdentityId,
): MockProxy<SignedHttpRequest> {
  const timestamp = Date.now();
  const path = `/keychains/${encodeURIComponent(headerIdentityId.valueOf())}`;
  const canonicalPayload = SignedHttpRequestSignature.signingContent({
    body: {},
    method: 'GET',
    path,
    timestamp: Number(timestamp),
  });
  const request: MockProxy<SignedHttpRequest> = mock<SignedHttpRequest>();
  const headers: Record<string, string> = {
    'x-identity-id': headerIdentityId.valueOf(),
    'x-signature': keyPair.sign(canonicalPayload).valueOf(),
    'x-timestamp': String(timestamp),
  };

  request.body = {};
  request.method = 'GET';
  request.path = path;
  request.header.mockImplementation(
    (header: string) => headers[header.toLowerCase()],
  );

  return request;
}

describe('SignedHttpRequestVerifier', () => {
  it('verifies browser requests signed with a numeric canonical timestamp', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const verifier = new SignedHttpRequestVerifier();

    expect(
      verifier
        .verifySignature(buildSignedRequest(keyPair, identityId))
        .identityId.isEqual(identityId),
    ).toBe(true);
  });

  it.each(IdentityIdMother.aliases())(
    'refuses an X-Identity-Id that names the signing key by %s',
    async (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const keyPair = await KeyPair.generate();
      const alias = aliasOf(new IdentityId(keyPair.toPrimitives().publicKey));
      const verifier = new SignedHttpRequestVerifier();

      expect(() =>
        verifier.verifySignature(buildSignedRequest(keyPair, alias)),
      ).toThrow(InvalidSignedRequestError);
    },
  );
});
