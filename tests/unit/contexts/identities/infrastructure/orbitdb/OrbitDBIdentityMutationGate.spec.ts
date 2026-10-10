import { Identity } from '@app/contexts/identities/domain/Identity';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { OrbitDBIdentityMutationGate } from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMutationGate';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { mock } from 'jest-mock-extended';
import { createHash } from 'node:crypto';

import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

describe('OrbitDBIdentityMutationGate', () => {
  const mapper = new IpfsIdentityMapper();
  const ipfs = mock<IPFS>();

  ipfs.calculateJSONId.mockImplementation((data) =>
    Promise.resolve(
      new IPFSId(
        `bafy${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
      ),
    ),
  );
  const gate = new OrbitDBIdentityMutationGate(ipfs);

  async function metadata(
    identity: Identity,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const primitives = identity.toPrimitives();
    const cid = (
      await ipfs.calculateJSONId(mapper.toDocument(identity))
    ).valueOf();

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

  it('should govern the identities collection and identity head keys only', () => {
    expect(gate.governs('identities')).toBe(true);
    expect(gate.governs('keychains')).toBe(false);
    expect(gate.governsHead('identity:owner')).toBe(true);
    expect(gate.governsHead('identity-handle:hasko')).toBe(true);
    expect(gate.governsHead('keychain:owner')).toBe(false);
  });

  it('should ignore collections it does not govern', async () => {
    await expect(gate.accepts('keychains', { forged: true })).resolves.toBe(
      true,
    );
  });

  it('should accept a self-signed first identity', async () => {
    const signer = await SignedIdentityMother.create();

    await expect(
      gate.accepts('identities', await metadata(signer.build())),
    ).resolves.toBe(true);
  });

  it('should reject a signed identity without a valid admission proof', async () => {
    const signer = await SignedIdentityMother.create();
    const invalid = signer.mineAdmissionNonce([
      '550e8400-e29b-41d4-a716-446655440009',
    ]);

    await expect(
      gate.accepts(
        'identities',
        await metadata(signer.build({ admissionNonce: invalid })),
      ),
    ).resolves.toBe(false);
  });

  it('should reject an identity that enters a network its proof does not cover', async () => {
    const signer = await SignedIdentityMother.create();
    const covered = signer.mineAdmissionNonce([
      '550e8400-e29b-41d4-a716-446655440009',
    ]);
    const identity = signer.build({
      admissionNonce: covered,
      networks: [
        '550e8400-e29b-41d4-a716-446655440009',
        '550e8400-e29b-41d4-a716-446655440008',
      ],
    });

    await expect(
      gate.accepts('identities', await metadata(identity)),
    ).resolves.toBe(false);
  });

  it('should accept a self-signed successor with a handle and previous cid', async () => {
    const signer = await SignedIdentityMother.create();
    const identity = signer.build({
      handle: 'hasko',
      previousIdentityExternalIdentifier: 'bafyprevious',
      version: 2,
    });

    await expect(
      gate.accepts('identities', await metadata(identity)),
    ).resolves.toBe(true);
  });

  it('should reject a reference-only record', async () => {
    const signer = await SignedIdentityMother.create();
    const record = await metadata(signer.build());

    delete record.identity;

    await expect(gate.accepts('identities', record)).resolves.toBe(false);
  });

  it('should reject a tampered embedded signature', async () => {
    const signer = await SignedIdentityMother.create();
    const record = await metadata(signer.build());

    await expect(
      gate.accepts('identities', {
        ...record,
        identity: {
          ...(record.identity as Record<string, unknown>),
          timestamp: 1,
        },
      }),
    ).resolves.toBe(false);
  });

  it('should reject an identity signed by another key', async () => {
    const owner = await SignedIdentityMother.create();
    const attacker = await SignedIdentityMother.create();
    const forged = {
      ...owner.build().toPrimitives(),
      signature: attacker.build().toPrimitives().signature,
    };

    await expect(
      gate.accepts(
        'identities',
        await metadata(owner.build(), { identity: forged }),
      ),
    ).resolves.toBe(false);
  });

  it.each([
    ['a wrong cid', { cid: 'bafyforged', id: 'bafyforged' }],
    ['an id different from the cid', { id: 'identity-id' }],
    ['a sender chosen receivedAt', { receivedAt: 1 }],
    ['a tombstone', { deleted: true }],
    ['an unknown key', { extra: 'value' }],
    ['another identityId', { identityId: 'someone-else' }],
    ['another handle', { handle: 'stolen' }],
    [
      'other networkIds',
      { networkIds: ['550e8400-e29b-41d4-a716-446655440999'] },
    ],
    ['another version', { version: 7 }],
    ['another previousCid', { previousCid: 'bafyother' }],
  ])('should reject %s', async (_, overrides) => {
    const signer = await SignedIdentityMother.create();

    await expect(
      gate.accepts('identities', await metadata(signer.build(), overrides)),
    ).resolves.toBe(false);
  });

  it('should reject a record above the size limit', async () => {
    const signer = await SignedIdentityMother.create();
    const record = await metadata(signer.build());

    await expect(
      gate.accepts('identities', {
        ...record,
        handle: 'x'.repeat(OrbitDBIdentityMutationGate.MAX_RECORD_BYTES),
      }),
    ).resolves.toBe(false);
  });

  it('should reject an identity with too many networks', async () => {
    const signer = await SignedIdentityMother.create();
    const networks = Array.from(
      { length: OrbitDBIdentityMutationGate.MAX_NETWORKS + 1 },
      (_, index) =>
        `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`,
    );

    await expect(
      gate.accepts('identities', await metadata(signer.build({ networks }))),
    ).resolves.toBe(false);
  });

  it('should accept heads bound to the signed identity and handle', async () => {
    const signer = await SignedIdentityMother.create();
    const record = await metadata(signer.build({ handle: 'hasko' }));

    await expect(
      gate.acceptsHead(`identity:${signer.id}`, record),
    ).resolves.toBe(true);
    await expect(
      gate.acceptsHead('identity-handle:hasko', record),
    ).resolves.toBe(true);
  });

  it('should reject a record planted under another identity or handle head', async () => {
    const signer = await SignedIdentityMother.create();
    const victim = await SignedIdentityMother.create();
    const record = await metadata(signer.build({ handle: 'hasko' }));

    await expect(
      gate.acceptsHead(`identity:${victim.id}`, record),
    ).resolves.toBe(false);
    await expect(
      gate.acceptsHead('identity-handle:victim', record),
    ).resolves.toBe(false);
  });

  it('should accept heads it does not govern', async () => {
    await expect(gate.acceptsHead('keychain:owner', {})).resolves.toBe(true);
  });
});
