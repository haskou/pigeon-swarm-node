import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';
import { CommunityInvitationAlreadyClaimedError } from '@app/contexts/communities/domain/errors/CommunityInvitationAlreadyClaimedError';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityInvitationClaimRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInvitationClaimRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

describe('OrbitDBCommunityInvitationClaimRepository', () => {
  const communityId = new CommunityId('community-1');
  const joiner = new IdentityId(
    'MCowBQYDK2VwAyEARcVr0970Zu0KPAIPEEvpy9RjsnM05VnDmccfWloMx8k=',
  );
  const claimOf = (community = communityId, invitationId = 'invitation-1') =>
    CommunityInvitationClaim.create(
      community,
      invitationId,
      joiner,
      'possession',
      'consent',
    );
  const proofOf = (claim: CommunityInvitationClaim, sequence = 0) =>
    signedMutation({
      identityId: joiner.valueOf(),
      kind: 'put',
      recordId: claim.toPrimitives().id,
      sequence,
      store: 'requests',
    });
  const heads = new Map<string, Record<string, unknown>>();
  const requests: Record<string, unknown>[] = [];
  let hasScope: jest.Mock;
  let requestsPut: jest.Mock;
  let store: OrbitDBCommunityInvitationClaimRepository;

  beforeEach(async () => {
    heads.clear();
    requests.splice(0);
    hasScope = jest.fn().mockResolvedValue(false);
    requestsPut = jest.fn((document: Record<string, unknown>) => {
      requests.push(document);

      return Promise.resolve('ok');
    });
    const registry = new OrbitDBReplicatedStateRegistry();
    await registry.register('network-1', {
      heads: {
        all: jest.fn(() =>
          Promise.resolve(
            [...heads.entries()].map(([key, value]) => ({ key, value })),
          ),
        ),
        get: jest.fn((key: string) => {
          const value = heads.get(key);

          return Promise.resolve(value ? { key, value } : undefined);
        }),
        put: jest.fn((key: string, value: Record<string, unknown>) => {
          heads.set(key, value);

          return Promise.resolve('ok');
        }),
      },
      requests: {
        put: requestsPut,
        query: jest.fn(
          (matcher: (document: Record<string, unknown>) => boolean) =>
            Promise.resolve(requests.filter(matcher)),
        ),
      },
    } as never);
    store = new OrbitDBCommunityInvitationClaimRepository(
      registry,
      new PrivateCommunityPublicStorageGuard(
        { hasScope } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );
  });

  it('saves a signed claim and lists it under its community only', async () => {
    const claim = claimOf();

    await store.save(claim, await proofOf(claim));

    expect(requestsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        ...claim.toPrimitives(),
        proof: expect.any(Object),
        scopeType: 'community_invitation_claim',
      }),
    );
    expect(
      (await store.findByCommunity(communityId)).map((found) =>
        found.toPrimitives(),
      ),
    ).toEqual([claim.toPrimitives()]);
    expect(await store.findByCommunity(new CommunityId('community-2'))).toEqual(
      [],
    );
  });

  it('refuses a second claim of the same invitation by the same identity', async () => {
    const claim = claimOf();

    await store.save(claim, await proofOf(claim));

    await expect(store.save(claim, await proofOf(claim, 1))).rejects.toThrow(
      CommunityInvitationAlreadyClaimedError,
    );
    expect(requestsPut).toHaveBeenCalledTimes(1);
  });

  it('keeps claims of a private community out of the public store', async () => {
    hasScope.mockResolvedValue(true);
    const claim = claimOf();

    await expect(store.save(claim, await proofOf(claim))).rejects.toThrow();
    expect(requestsPut).not.toHaveBeenCalled();
  });
});
