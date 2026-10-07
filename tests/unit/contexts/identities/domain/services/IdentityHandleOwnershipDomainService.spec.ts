import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import IdentityHandleOwnershipDomainService from '@app/contexts/identities/domain/services/IdentityHandleOwnershipDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';

import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

describe('IdentityHandleOwnershipDomainService', () => {
  const service = new IdentityHandleOwnershipDomainService();
  const handle = new ProfileHandle('claimed');

  function candidate(identity: Identity, cid: string): IdentityCandidate {
    return new IdentityCandidate(new IdentityExternalIdentifier(cid), identity);
  }

  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];

    return items.flatMap((item, position) =>
      permutations([
        ...items.slice(0, position),
        ...items.slice(position + 1),
      ]).map((rest) => [item, ...rest]),
    );
  }

  it('should pick the earliest signed claim', async () => {
    const late = await SignedIdentityMother.create();
    const early = await SignedIdentityMother.create();

    const owner = service.owner(
      [
        candidate(late.build({ handle: 'claimed', timestamp: 20 }), 'bafy-a'),
        candidate(early.build({ handle: 'claimed', timestamp: 10 }), 'bafy-b'),
      ],
      handle,
    );

    expect(owner?.getIdentity().toPrimitives().id).toBe(early.id);
  });

  it('should break equal timestamps by the lowest identity id', async () => {
    const signers = await Promise.all(
      Array.from({ length: 3 }, () => SignedIdentityMother.create()),
    );
    const owner = service.owner(
      signers.map((signer, position) =>
        candidate(
          signer.build({ handle: 'claimed', timestamp: 5 }),
          `bafy-${position}`,
        ),
      ),
      handle,
    );

    expect(owner?.getIdentity().toPrimitives().id).toBe(
      signers.map(({ id }) => id).sort()[0],
    );
  });

  it('should return the same ranking for every input order', async () => {
    const signers = await Promise.all(
      Array.from({ length: 4 }, () => SignedIdentityMother.create()),
    );
    const candidates = signers.map((signer, position) =>
      candidate(
        signer.build({ handle: 'claimed', timestamp: 100 - position }),
        `bafy-${position}`,
      ),
    );
    const rankings = new Set(
      permutations(candidates).map((order) =>
        service
          .rank(order, handle)
          .map((ranked) => ranked.getExternalIdentifier().valueOf())
          .join(','),
      ),
    );

    expect(rankings).toEqual(new Set(['bafy-3,bafy-2,bafy-1,bafy-0']));
  });

  it('should only consider the latest version of each identity', async () => {
    const first = await SignedIdentityMother.create();
    const second = await SignedIdentityMother.create();

    const candidates = [
      candidate(first.build({ handle: 'claimed', timestamp: 1 }), 'bafy-v1'),
      candidate(
        first.build({
          handle: 'other',
          previousIdentityExternalIdentifier: 'bafy-v1',
          timestamp: 2,
          version: 2,
        }),
        'bafy-v2',
      ),
      candidate(second.build({ handle: 'claimed', timestamp: 50 }), 'bafy-s'),
    ];

    expect(
      service.owner(candidates, handle)?.getIdentity().toPrimitives().id,
    ).toBe(second.id);
    expect(
      service
        .owner(candidates, new ProfileHandle('other'))
        ?.getIdentity()
        .toPrimitives().id,
    ).toBe(first.id);
  });

  it('should keep the earliest signed claim of an identity that renewed the handle', async () => {
    const renewer = await SignedIdentityMother.create();
    const rival = await SignedIdentityMother.create();
    const candidates = [
      candidate(renewer.build({ handle: 'claimed', timestamp: 1 }), 'bafy-r1'),
      candidate(
        renewer.build({
          handle: 'claimed',
          previousIdentityExternalIdentifier: 'bafy-r1',
          timestamp: 90,
          version: 2,
        }),
        'bafy-r2',
      ),
      candidate(rival.build({ handle: 'claimed', timestamp: 40 }), 'bafy-x'),
    ];

    expect(
      service.owner(candidates, handle)?.getExternalIdentifier().valueOf(),
    ).toBe('bafy-r2');
  });

  it('should return no owner when nobody claims the handle', async () => {
    const signer = await SignedIdentityMother.create();

    expect(
      service.owner([candidate(signer.build(), 'bafy-none')], handle),
    ).toBeUndefined();
  });
});
