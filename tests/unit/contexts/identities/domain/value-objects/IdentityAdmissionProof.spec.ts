import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

describe('IdentityAdmissionProof', () => {
  const networks = [
    '550e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440001',
  ];

  function mine(identityId: string, networkIds: string[], bits: number) {
    const proof = new IdentityAdmissionProof(identityId, networkIds);
    let nonce = 0;

    while (!proof.isValid(nonce.toString(), bits)) {
      nonce += 1;
    }

    return nonce.toString();
  }

  it('accepts a mined nonce and is independent of network order', () => {
    const nonce = mine('identity-a', networks, 10);
    const reversed = [...networks].reverse();

    expect(
      new IdentityAdmissionProof('identity-a', networks).isValid(nonce, 10),
    ).toBe(true);
    expect(
      new IdentityAdmissionProof('identity-a', reversed).isValid(nonce, 10),
    ).toBe(true);
  });

  it('binds the proof to the identity key', () => {
    const nonce = mine('identity-a', networks, 12);

    expect(
      new IdentityAdmissionProof('identity-b', networks).isValid(nonce, 12),
    ).toBe(false);
  });

  it('binds the proof to the networks being entered', () => {
    const nonce = mine('identity-a', [networks[0]], 12);

    expect(
      new IdentityAdmissionProof('identity-a', networks).isValid(nonce, 12),
    ).toBe(false);
  });

  it('costs more work as difficulty grows', () => {
    const easy = mine('identity-a', networks, 4);

    expect(
      new IdentityAdmissionProof('identity-a', networks).isValid(easy, 24),
    ).toBe(false);
  });

  it.each([undefined, '', 'x'.repeat(65)])(
    'rejects a missing or oversized nonce (%s)',
    (nonce) => {
      expect(
        new IdentityAdmissionProof('identity-a', networks).isValid(nonce, 1),
      ).toBe(false);
    },
  );

  it('uses one protocol difficulty and ignores any environment override', () => {
    const previous = process.env.IDENTITY_ADMISSION_DIFFICULTY_BITS;
    process.env.IDENTITY_ADMISSION_DIFFICULTY_BITS = '4';

    try {
      const proof = new IdentityAdmissionProof('identity-a', networks);
      const nonce = proof.mine();

      expect(IdentityAdmissionProof.DIFFICULTY_BITS).toBe(16);
      expect(proof.isValid(nonce, 16)).toBe(true);
    } finally {
      if (previous === undefined)
        delete process.env.IDENTITY_ADMISSION_DIFFICULTY_BITS;
      else process.env.IDENTITY_ADMISSION_DIFFICULTY_BITS = previous;
    }
  });
});
