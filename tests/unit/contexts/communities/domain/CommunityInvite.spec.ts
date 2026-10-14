import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from '@app/contexts/communities/domain/value-objects/CommunityInviteNonce';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { CommunityInviteUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteUses';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('CommunityInvite', () => {
  const communityId = CommunityId.generate();
  const creatorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );

  const createdAt = new Timestamp(1770000000000);
  const nonce = new CommunityInviteNonce('nonce-0123456789abcdef');

  it('derives its token from community, creator, nonce and its limits', () => {
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      nonce,
      createdAt,
      new Timestamp(1770000005000),
      new CommunityInviteMaxUses(3),
    );

    expect(invite.getToken().valueOf()).toBe(
      CommunityInviteToken.derive(
        communityId.valueOf(),
        creatorIdentityId.valueOf(),
        nonce.valueOf(),
        3,
        1770000005000,
      ).valueOf(),
    );
  });

  it('commits its token to maxUses and expiresAt, so neither can be rewritten', () => {
    const tokenOf = (expiresAt?: Timestamp, maxUses = 1): string =>
      CommunityInvite.create(
        communityId,
        creatorIdentityId,
        nonce,
        createdAt,
        expiresAt,
        new CommunityInviteMaxUses(maxUses),
      )
        .getToken()
        .valueOf();
    const tokens = [
      tokenOf(),
      tokenOf(undefined, 2),
      tokenOf(new Timestamp(1770000005000)),
      tokenOf(new Timestamp(1770000006000)),
    ];

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('is redeemable only strictly before it expires', () => {
    const expiresAt = 1770000005000;
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      nonce,
      createdAt,
      new Timestamp(expiresAt),
      new CommunityInviteMaxUses(1),
    );

    expect(() =>
      invite.assertRedeemableAt(new Timestamp(expiresAt - 1)),
    ).not.toThrow();
    expect(() => invite.assertRedeemableAt(new Timestamp(expiresAt))).toThrow(
      'Community invite has expired',
    );
  });

  it('accepts while uses remain and rejects once exhausted', () => {
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      nonce,
      createdAt,
    );

    expect(() =>
      invite.checkAcceptanceAvailability(new CommunityInviteUses(0)),
    ).not.toThrow();
    expect(() =>
      invite.checkAcceptanceAvailability(new CommunityInviteUses(1)),
    ).toThrow('Community invite maximum uses exceeded');
  });

  it('rejects expired invites', () => {
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      nonce,
      createdAt,
      new Timestamp(1770000000000),
      new CommunityInviteMaxUses(1),
    );

    expect(() =>
      invite.checkAcceptanceAvailability(
        new CommunityInviteUses(0),
        new Timestamp(1770000000001),
      ),
    ).toThrow('Community invite has expired');
  });
});
