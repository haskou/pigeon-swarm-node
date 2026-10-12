import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRecordAdmissionDomainService from '@app/contexts/identities/domain/services/IdentityRecordAdmissionDomainService';

import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

describe('IdentityRecordAdmissionDomainService', () => {
  const admission = new IdentityRecordAdmissionDomainService();

  function recordFor(
    identity: Identity,
    cid = 'bafy-record',
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const primitives = identity.toPrimitives();

    return {
      cid,
      id: cid,
      identity: primitives,
      identityId: primitives.id,
      networkIds: primitives.networks,
      version: primitives.version,
      ...(primitives.profile.handle
        ? { handle: primitives.profile.handle }
        : {}),
      ...(primitives.previousIdentityExternalIdentifier
        ? { previousCid: primitives.previousIdentityExternalIdentifier }
        : {}),
      ...overrides,
    };
  }

  describe('admitsShape', () => {
    it('should admit a well-formed record within the size limit', async () => {
      const signer = await SignedIdentityMother.create();
      const record = recordFor(signer.build());

      expect(admission.admitsShape(record, 100)).toBe(true);
      expect(
        admission.admitsShape(
          record,
          IdentityRecordAdmissionDomainService.MAX_RECORD_BYTES,
        ),
      ).toBe(true);
    });

    it.each([
      ['a tombstone', { deleted: true }],
      ['a local receipt stamp', { receivedAt: 1 }],
      ['an unknown key', { forged: 'x' }],
      ['an id that differs from the cid', { id: 'other' }],
      ['a non-string cid', { cid: 1, id: 1 }],
    ])('should reject %s', async (_, overrides) => {
      const signer = await SignedIdentityMother.create();

      expect(
        admission.admitsShape(recordFor(signer.build(), 'bafy-record', overrides), 100),
      ).toBe(false);
    });

    it('should reject a record above the size limit', async () => {
      const signer = await SignedIdentityMother.create();

      expect(
        admission.admitsShape(
          recordFor(signer.build()),
          IdentityRecordAdmissionDomainService.MAX_RECORD_BYTES + 1,
        ),
      ).toBe(false);
    });
  });

  describe('admitsIdentity', () => {
    it('should admit an identity whose redundant fields repeat its signed fields', async () => {
      const signer = await SignedIdentityMother.create();
      const identity = signer.build({ handle: 'hasko' });

      expect(
        admission.admitsIdentity(identity, recordFor(identity)),
      ).toBe(true);
    });

    it('should reject a record whose redundant identityId differs from the signed id', async () => {
      const signer = await SignedIdentityMother.create();
      const identity = signer.build();

      expect(
        admission.admitsIdentity(
          identity,
          recordFor(identity, 'bafy-record', { identityId: 'someone-else' }),
        ),
      ).toBe(false);
    });

    it('should reject an identity above the network cap while admitting exactly the cap', async () => {
      const signer = await SignedIdentityMother.create();
      const networksAt = (count: number) =>
        Array.from(
          { length: count },
          (_, index) =>
            `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`,
        );
      const atCap = networksAt(IdentityRecordAdmissionDomainService.MAX_NETWORKS);
      const overCap = networksAt(
        IdentityRecordAdmissionDomainService.MAX_NETWORKS + 1,
      );

      const admitted = signer.build({
        networks: atCap,
        admissionNonce: signer.mineAdmissionNonce(atCap),
      });
      const rejected = signer.build({
        networks: overCap,
        admissionNonce: signer.mineAdmissionNonce(overCap),
      });

      expect(
        admission.admitsIdentity(admitted, recordFor(admitted)),
      ).toBe(true);
      expect(
        admission.admitsIdentity(rejected, recordFor(rejected)),
      ).toBe(false);
    });
  });

  describe('admitsCanonicalCid', () => {
    it('should admit only a string cid equal to the calculated content id', () => {
      expect(admission.admitsCanonicalCid('bafy-a', 'bafy-a')).toBe(true);
      expect(admission.admitsCanonicalCid('bafy-a', 'bafy-b')).toBe(false);
      expect(admission.admitsCanonicalCid(undefined, 'bafy-a')).toBe(false);
    });
  });
});
