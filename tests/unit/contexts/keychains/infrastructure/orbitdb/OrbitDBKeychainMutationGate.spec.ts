import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import IpfsKeychainMapper from '@app/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import { OrbitDBKeychainMutationGate } from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMutationGate';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { mock } from 'jest-mock-extended';
import { createHash } from 'node:crypto';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('OrbitDBKeychainMutationGate', () => {
  const mapper = new IpfsKeychainMapper();
  const ipfs = mock<IPFS>();

  ipfs.calculateJSONId.mockImplementation((data) =>
    Promise.resolve(
      new IPFSId(
        `bafy${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
      ),
    ),
  );
  const gate = new OrbitDBKeychainMutationGate(
    new KeychainSignatureDomainService(),
    mapper,
    ipfs,
  );

  async function metadata(
    mother: KeychainMother,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const cid = (
      await ipfs.calculateJSONId(mapper.toDocument(mother.build()))
    ).valueOf();
    const primitives = mother.primitives();

    return {
      cid,
      encryptedPayload: primitives.encryptedPayload,
      id: cid,
      networkIds: [],
      ownerIdentityId: primitives.ownerIdentityId,
      receivedAt: 1,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
      ...(primitives.previousKeychainExternalIdentifier
        ? { previousCid: primitives.previousKeychainExternalIdentifier }
        : {}),
      ...overrides,
    };
  }

  it('should only govern the keychains collection and keychain head keys', () => {
    expect(gate.governs('keychains')).toBe(true);
    expect(gate.governs('identities')).toBe(false);
    expect(gate.governsHead('keychain:owner')).toBe(true);
    expect(gate.governsHead('keychain-cid:bafy')).toBe(true);
    expect(gate.governsHead('identity:owner')).toBe(false);
  });

  it('should accept an owner-signed first keychain', async () => {
    const mother = await KeychainMother.create();

    await expect(
      gate.accepts('keychains', await metadata(mother)),
    ).resolves.toBe(true);
  });

  it('should accept an owner-signed successor with its previous cid', async () => {
    const mother = (await KeychainMother.create())
      .withVersion(2)
      .withPreviousKeychainExternalIdentifier('bafyprevious');

    await expect(
      gate.accepts('keychains', await metadata(mother)),
    ).resolves.toBe(true);
  });

  it('should ignore collections it does not govern', async () => {
    await expect(gate.accepts('identities', { forged: true })).resolves.toBe(
      true,
    );
  });

  it('should reject a signature made by another key', async () => {
    const owner = await KeychainMother.create();
    const attacker = await KeychainMother.create();

    await expect(
      gate.accepts(
        'keychains',
        await metadata(owner, {
          signature: attacker.signature().valueOf(),
        }),
      ),
    ).resolves.toBe(false);
  });

  it('should reject a record whose owner differs from the signing key', async () => {
    const owner = await KeychainMother.create();
    const attacker = await KeychainMother.create();

    await expect(
      gate.accepts(
        'keychains',
        await metadata(owner, {
          ownerIdentityId: attacker.ownerIdentityId.valueOf(),
        }),
      ),
    ).resolves.toBe(false);
  });

  it('should reject a tampered signed field', async () => {
    const mother = await KeychainMother.create();

    await expect(
      gate.accepts(
        'keychains',
        await metadata(mother, { encryptedPayload: 'tampered' }),
      ),
    ).resolves.toBe(false);
  });

  it('should reject a cid that is not the canonical content id', async () => {
    const mother = await KeychainMother.create();

    await expect(
      gate.accepts(
        'keychains',
        await metadata(mother, { cid: 'bafyother', id: 'bafyother' }),
      ),
    ).resolves.toBe(false);
  });

  it('should reject an id different from the cid', async () => {
    const mother = await KeychainMother.create();

    await expect(
      gate.accepts('keychains', await metadata(mother, { id: 'bafyother' })),
    ).resolves.toBe(false);
  });

  it('should reject a first version that claims a previous keychain', async () => {
    const mother = (
      await KeychainMother.create()
    ).withPreviousKeychainExternalIdentifier('bafyprevious');

    await expect(
      gate.accepts('keychains', await metadata(mother)),
    ).resolves.toBe(false);
  });

  it('should reject a later version without a previous keychain', async () => {
    const mother = (await KeychainMother.create()).withVersion(2);

    await expect(
      gate.accepts('keychains', await metadata(mother)),
    ).resolves.toBe(false);
  });

  it('should reject deletion tombstones', async () => {
    const mother = await KeychainMother.create();

    await expect(
      gate.accepts('keychains', await metadata(mother, { deleted: true })),
    ).resolves.toBe(false);
  });

  it('should reject malformed records', async () => {
    await expect(
      gate.accepts('keychains', { cid: 'x', id: 'x' }),
    ).resolves.toBe(false);
  });

  describe('heads', () => {
    it('should accept a signed record under its owner and cid head keys', async () => {
      const mother = await KeychainMother.create();
      const record = await metadata(mother);

      await expect(
        gate.acceptsHead(
          `keychain:${mother.ownerIdentityId.valueOf()}`,
          record,
        ),
      ).resolves.toBe(true);
      await expect(
        gate.acceptsHead(`keychain-cid:${String(record.cid)}`, record),
      ).resolves.toBe(true);
    });

    it('should reject a record planted under another owner head key', async () => {
      const victim = await KeychainMother.create();
      const attacker = await KeychainMother.create();

      await expect(
        gate.acceptsHead(
          `keychain:${victim.ownerIdentityId.valueOf()}`,
          await metadata(attacker),
        ),
      ).resolves.toBe(false);
    });

    it('should reject a record planted under a different cid head key', async () => {
      const mother = await KeychainMother.create();

      await expect(
        gate.acceptsHead('keychain-cid:bafyother', await metadata(mother)),
      ).resolves.toBe(false);
    });

    it('should reject a forged record under its own head key', async () => {
      const mother = await KeychainMother.create();
      const forged = await metadata(mother, { encryptedPayload: 'forged' });

      await expect(
        gate.acceptsHead(
          `keychain:${mother.ownerIdentityId.valueOf()}`,
          forged,
        ),
      ).resolves.toBe(false);
    });

    it('should ignore heads it does not govern', async () => {
      await expect(gate.acceptsHead('identity:owner', {})).resolves.toBe(true);
    });
  });
});
