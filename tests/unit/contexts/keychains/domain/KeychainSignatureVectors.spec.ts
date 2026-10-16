import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import { readFileSync } from 'node:fs';

type Vectors = {
  accepted: {
    expected: { signature: string; signingPayload: string };
    input: {
      encryptedPayload: string;
      previousKeychainExternalIdentifier: null | string;
      timestamp: number;
      version: number;
    };
    name: string;
  }[];
  ownerIdentityId: string;
  rejected: {
    input: Vectors['accepted'][number]['input'] & { signature: string };
    name: string;
  }[];
};

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/keychain-signature.json'),
    'utf8',
  ),
) as Vectors;

const keychainOf = (
  input: Vectors['accepted'][number]['input'],
  signature: string,
): Keychain =>
  Keychain.fromPrimitives({
    encryptedPayload: input.encryptedPayload,
    ownerIdentityId: vectors.ownerIdentityId,
    previousKeychainExternalIdentifier:
      input.previousKeychainExternalIdentifier ?? undefined,
    signature,
    timestamp: input.timestamp,
    version: input.version,
  });

describe('Keychain signature vectors', () => {
  const service = new KeychainSignatureDomainService();

  it.each(vectors.accepted)(
    'derives the signing payload of $name',
    ({ expected, input }) => {
      const keychain = keychainOf(input, expected.signature);

      expect(
        service.getCanonicalSigningContent(keychain.getSignaturePayload()),
      ).toBe(expected.signingPayload);
    },
  );

  it.each(vectors.accepted)('accepts $name', ({ expected, input }) => {
    expect(
      service.isValidSignature(keychainOf(input, expected.signature)),
    ).toBe(true);
  });

  it.each(vectors.rejected)('rejects $name', ({ input }) => {
    expect(service.isValidSignature(keychainOf(input, input.signature))).toBe(
      false,
    );
  });
});
