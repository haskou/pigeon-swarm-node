import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

describe('IdentityAdmissionProof', () => {
  const networks = [
    '550e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440001',
  ];

  function mine(identityId: string, networkIds: string[], bits: number) {
    let nonce = 0;

    while (
      !IdentityAdmissionProof.isValid(
        identityId,
        networkIds,
        nonce.toString(),
        bits,
      )
    ) {
      nonce += 1;
    }

    return nonce.toString();
  }

  it('accepts a mined nonce and is independent of network order', () => {
    const nonce = mine('identity-a', networks, 10);

    expect(
      IdentityAdmissionProof.isValid('identity-a', networks, nonce, 10),
    ).toBe(true);
    expect(
      IdentityAdmissionProof.isValid(
        'identity-a',
        [...networks].reverse(),
        nonce,
        10,
      ),
    ).toBe(true);
  });

  it('binds the proof to the identity key', () => {
    const nonce = mine('identity-a', networks, 12);

    expect(
      IdentityAdmissionProof.isValid('identity-b', networks, nonce, 12),
    ).toBe(false);
  });

  it('binds the proof to the networks being entered', () => {
    const nonce = mine('identity-a', [networks[0]], 12);

    expect(
      IdentityAdmissionProof.isValid('identity-a', networks, nonce, 12),
    ).toBe(false);
  });

  it('costs more work as difficulty grows', () => {
    const easy = mine('identity-a', networks, 4);

    expect(
      IdentityAdmissionProof.isValid('identity-a', networks, easy, 24),
    ).toBe(false);
  });

  it.each([undefined, '', 'x'.repeat(65)])(
    'rejects a missing or oversized nonce (%s)',
    (nonce) => {
      expect(
        IdentityAdmissionProof.isValid('identity-a', networks, nonce, 1),
      ).toBe(false);
    },
  );

  it('falls back to the default for invalid configuration', () => {
    const configured = (value: number) =>
      IdentityAdmissionProof.difficultyBits({
        IDENTITY_ADMISSION_DIFFICULTY_BITS: value,
      } as never);

    expect(configured(0)).toBe(IdentityAdmissionProof.DEFAULT_DIFFICULTY_BITS);
    expect(configured(33)).toBe(IdentityAdmissionProof.DEFAULT_DIFFICULTY_BITS);
    expect(configured(Number.NaN)).toBe(
      IdentityAdmissionProof.DEFAULT_DIFFICULTY_BITS,
    );
    expect(configured(20)).toBe(20);
  });
});
