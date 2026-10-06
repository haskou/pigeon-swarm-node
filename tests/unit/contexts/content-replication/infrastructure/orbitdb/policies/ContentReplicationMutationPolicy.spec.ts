import { maxContentSizeBytes } from '@app/contexts/content-replication/application/publish-content/ContentUploadLimits';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import { ContentReplicationLimits } from '@app/contexts/content-replication/domain/ContentReplicationLimits';
import ContentReplicationMutationPolicy from '@app/contexts/content-replication/infrastructure/orbitdb/policies/ContentReplicationMutationPolicy';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../../../public-mutations/support/signedMutation';

const OWNER = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
const MALLORY = 'ff'.repeat(32);
const NETWORK = '550e8400-e29b-41d4-a716-446655440001';
const FOREIGN_NETWORK = '550e8400-e29b-41d4-a716-446655440002';
const cidOf = (index: number): string =>
  `bafkreia${index.toString().padStart(8, '0')}`;

describe('ContentReplicationMutationPolicy', () => {
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let identityRepository: MockProxy<IdentityRepository>;
  let verifier: MockProxy<PublicMutationVerifier>;
  let policy: ContentReplicationMutationPolicy;

  function record(
    overrides: Record<string, unknown> = {},
    cid = cidOf(1),
  ): Record<string, unknown> {
    const networkId = (overrides.networkId as string) ?? NETWORK;

    return {
      cid,
      context: 'ipfs_private_upload',
      id: ContentReplication.idOf(networkId, cid),
      networkId,
      ownerIdentityId: OWNER,
      scopeType: 'content_replication',
      sizeBytes: 1024,
      ...overrides,
    };
  }

  async function stored(
    cid: string,
    sizeBytes: number,
  ): Promise<Record<string, unknown>> {
    const payload = record({ sizeBytes }, cid);

    return {
      ...payload,
      proof: (
        await signedMutation({
          identityId: OWNER,
          kind: 'put',
          payload,
          recordId: payload.id as string,
          sequence: 0,
          store: 'contentReplication',
        })
      ).toPrimitives(),
    };
  }

  beforeEach(() => {
    registry = mock<OrbitDBReplicatedStateRegistry>();
    identityRepository = mock<IdentityRepository>();
    verifier = mock<PublicMutationVerifier>();
    policy = new ContentReplicationMutationPolicy(
      registry,
      identityRepository,
      verifier,
    );
    policy.limits = new ContentReplicationLimits(10_000, 3);
    registry.queryUnadmittedDocuments.mockResolvedValue([]);
    identityRepository.findById.mockResolvedValue({
      getNetworkIds: () => [{ valueOf: () => NETWORK }],
    } as unknown as Identity);
  });

  describe('expectationOf', () => {
    it('binds the proof to the id, the owner and the store', () => {
      expect(policy.expectationOf(record())).toEqual({
        authorIdentityId: OWNER,
        recordId: ContentReplication.idOf(NETWORK, cidOf(1)),
        store: 'contentReplication',
      });
    });

    it('refuses an id that is not derived from the network and cid', () => {
      expect(() =>
        policy.expectationOf(record({ id: `content:${NETWORK}:other` })),
      ).toThrow(InvalidPublicMutationError);
    });

    it.each(['contentType', 'filename', 'priority', 'claimedBy', 'withdrawnAt'])(
      'refuses the replicated field %s',
      (field) => {
        expect(() =>
          policy.expectationOf(record({ [field]: 'x' })),
        ).toThrow(InvalidPublicMutationError);
      },
    );

    it('expects a tombstone to be signed by the owner it names', () => {
      expect(
        policy.expectationOf({
          cid: cidOf(1),
          id: ContentReplication.idOf(NETWORK, cidOf(1)),
          networkId: NETWORK,
          ownerIdentityId: OWNER,
          removed: true,
          scopeType: 'content_replication',
        }).authorIdentityId,
      ).toBe(OWNER);
    });
  });

  describe('assertPermitted', () => {
    const admit = (
      overrides: Record<string, unknown> = {},
      cid = cidOf(1),
    ): Promise<void> =>
      policy.assertPermitted(record(overrides, cid), OWNER, false);

    it('admits a registration inside the owner network', async () => {
      await expect(admit()).resolves.toBeUndefined();
    });

    it.each([0, -1, 1.5, maxContentSizeBytes + 1, Number.NaN])(
      'refuses sizeBytes %p',
      async (sizeBytes) => {
        await expect(admit({ sizeBytes })).rejects.toThrow(
          InvalidPublicMutationError,
        );
      },
    );

    it('refuses an unknown context', async () => {
      await expect(admit({ context: 'html' })).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('refuses a network the owner does not belong to', async () => {
      await expect(admit({ networkId: FOREIGN_NETWORK })).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('refuses an owner that is not a published identity', async () => {
      identityRepository.findById.mockRejectedValue(new Error('unknown'));

      await expect(admit()).rejects.toThrow(InvalidPublicMutationError);
    });

    it('refuses a registration over the byte quota', async () => {
      policy.limits = new ContentReplicationLimits(2048, 10);
      registry.queryUnadmittedDocuments.mockResolvedValue([
        await stored(cidOf(0), 1500),
      ]);

      await expect(admit({ sizeBytes: 1024 }, cidOf(2))).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('refuses a registration over the record count', async () => {
      registry.queryUnadmittedDocuments.mockResolvedValue([
        await stored(cidOf(0), 1),
        await stored(cidOf(1), 1),
        await stored(cidOf(2), 1),
      ]);

      await expect(admit({}, cidOf(5))).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('does not let records that sort after it consume its budget', async () => {
      policy.limits = new ContentReplicationLimits(2048, 10);
      registry.queryUnadmittedDocuments.mockResolvedValue([
        await stored(cidOf(9), 2000),
      ]);

      await expect(admit({ sizeBytes: 1024 }, cidOf(2))).resolves.toBeUndefined();
    });

    it('ignores stored records whose proof does not verify', async () => {
      policy.limits = new ContentReplicationLimits(2048, 10);
      registry.queryUnadmittedDocuments.mockResolvedValue([
        await stored(cidOf(0), 2000),
      ]);
      verifier.verify.mockRejectedValue(new InvalidPublicMutationError());

      await expect(admit({ sizeBytes: 1024 }, cidOf(2))).resolves.toBeUndefined();
    });

    it('lets a deletion through the policy: only the expected author can sign it', async () => {
      await expect(
        policy.assertPermitted(record(), MALLORY, true),
      ).resolves.toBeUndefined();
      expect(
        policy.expectationOf({
          cid: cidOf(1),
          id: ContentReplication.idOf(NETWORK, cidOf(1)),
          networkId: NETWORK,
          ownerIdentityId: OWNER,
          removed: true,
          scopeType: 'content_replication',
        }).authorIdentityId,
      ).not.toBe(MALLORY);
    });
  });
});
