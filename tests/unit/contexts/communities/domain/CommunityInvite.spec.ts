import { CommunityInvite } from '@app/contexts/communities/domain/CommunityInvite';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('CommunityInvite', () => {
  const communityId = CommunityId.generate();
  const creatorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );

  it('consumes invite uses when accepted', () => {
    const invite = CommunityInvite.create(communityId, creatorIdentityId);

    invite.accept();

    expect(invite.toPrimitives().uses).toBe(1);
  });

  it('rejects exhausted invites', () => {
    const invite = CommunityInvite.create(communityId, creatorIdentityId);

    invite.accept();

    expect(() => invite.accept()).toThrow(
      'Community invite maximum uses exceeded',
    );
  });

  it('rejects expired invites', () => {
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      new Timestamp(1770000000000),
      new CommunityInviteMaxUses(1),
    );

    expect(() => invite.accept(new Timestamp(1770000000001))).toThrow(
      'Community invite has expired',
    );
  });
});
