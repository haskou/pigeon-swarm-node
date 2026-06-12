import {
  SignedHttpRequest,
  SignedHttpRequestVerifier,
} from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('SignedHttpRequestVerifier', () => {
  it('verifies browser requests signed with a numeric canonical timestamp', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const timestamp = Date.now();
    const path = `/keychains/${encodeURIComponent(identityId.valueOf())}`;
    const verifier = new SignedHttpRequestVerifier();
    const canonicalPayload = verifier.getCanonicalPayload(
      'GET',
      path,
      timestamp,
      {},
    );
    const signature = keyPair.sign(JSON.stringify(canonicalPayload)).valueOf();
    const request: MockProxy<SignedHttpRequest> = mock<SignedHttpRequest>();
    const headers: Record<string, string> = {
      'x-identity-id': identityId.valueOf(),
      'x-signature': signature,
      'x-timestamp': String(timestamp),
    };

    request.body = {};
    request.method = 'GET';
    request.path = path;
    request.header.mockImplementation(
      (header: string) => headers[header.toLowerCase()],
    );

    expect(verifier.verifySignature(request).identityId.isEqual(identityId)).toBe(
      true,
    );
  });
});
