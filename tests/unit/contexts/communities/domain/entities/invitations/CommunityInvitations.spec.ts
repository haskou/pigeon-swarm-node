import { CommunityInvitations } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitations';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';

import {
  admission,
  alice,
  bob,
  genesis,
  invitation,
  revoke,
} from '../../operations/CommunityOperationFixtures';

describe('CommunityInvitations', () => {
  const created = genesis();
  const community = CommunityStateFold.fold([created]).community!;
  const invited = invitation([created], undefined, {}, 10);
  const id = invited.operation.getHash();
  const issued = CommunityInvitations.EMPTY.after(invited.operation, true);

  it('issues an invitation only for an applied invitation_created', () => {
    expect(
      CommunityInvitations.EMPTY.after(invited.operation, false).list(),
    ).toEqual([]);
    expect(issued.find(id)?.getId()).toBe(id);
    expect(issued.findByKey(invited.key.publicKey())?.getId()).toBe(id);
  });

  it('finds an invitation by key in its latest status, and no other key', () => {
    const revoked = issued.after(revoke([invited.operation], invited), true);

    expect(revoked.findByKey(invited.key.publicKey())?.isRevoked()).toBe(true);
    expect(
      revoked.findByKey(invitation([created], bob).key.publicKey()),
    ).toBeUndefined();
  });

  it('counts every admission, applied or not, and leaves the earlier collection alone', () => {
    const used = issued
      .after(
        admission([invited.operation], invited, alice, undefined, 11),
        false,
      )
      .after(admission([invited.operation], invited, bob, undefined, 11), true);

    expect(used.find(id)?.hasJoined(alice)).toBe(true);
    expect(used.find(id)?.hasJoined(bob)).toBe(true);
    expect(issued.find(id)?.hasJoined(alice)).toBe(false);
  });

  it('revokes only on an applied revocation', () => {
    const revocation = revoke([invited.operation], invited);

    expect(issued.after(revocation, false).find(id)?.isRevoked()).toBe(false);
    expect(issued.after(revocation, true).find(id)?.isRevoked()).toBe(true);
  });

  it('ignores operations about invitations it does not know', () => {
    expect(
      CommunityInvitations.EMPTY.after(revoke([created], invited), true).list(),
    ).toEqual([]);
  });

  it('cuts the invitations a predicate tells, which are no longer live', () => {
    expect(issued.find(id)?.isLiveIn(community)).toBe(true);
    expect(
      issued
        .cutWhere(() => true)
        .find(id)
        ?.isLiveIn(community),
    ).toBe(false);
    expect(
      issued
        .cutWhere(() => false)
        .find(id)
        ?.isLiveIn(community),
    ).toBe(true);
  });
});
