import { CommunityOperationLedger } from '@app/contexts/communities/domain/operations/CommunityOperationLedger';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';

import {
  alice,
  ban,
  communityId,
  genesis,
  join,
  mallory,
  operation,
  owner,
} from './CommunityOperationFixtures';

describe('CommunityOperationLedger', () => {
  it('admits operations in the history they build on', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const joined = join([created], alice);

    expect(() => {
      ledger.admit(created);
      ledger.admit(joined);
      ledger.admit(ban([joined], alice));
    }).not.toThrow();
  });

  it('refuses a forged operation against its causal past', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();

    ledger.admit(created);

    expect(() => ledger.admit(ban([created], owner, mallory))).toThrow();
    expect(() => ledger.admit(join([created], mallory, mallory))).toThrow();
  });

  it('refuses an operation whose parents are unknown', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const orphan = join([join([created], alice)], mallory);

    ledger.admit(created);

    expect(() => ledger.admit(orphan)).toThrow();
  });

  it('admits an operation after its missing parent arrives', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const joined = join([created], alice);
    const next = join([joined], mallory);

    ledger.admit(created);
    expect(() => ledger.admit(next)).toThrow();

    ledger.admit(joined);

    expect(() => ledger.admit(next)).not.toThrow();
  });

  it('authorizes an operation against the merged history of several parents', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const joinedAlice = join([created], alice);
    const joinedMallory = join([created], mallory);
    const merged = ban([joinedAlice, joinedMallory], mallory);

    [created, joinedAlice, joinedMallory].forEach((operation) =>
      ledger.admit(operation),
    );

    expect(() => ledger.admit(merged)).not.toThrow();
  });

  it('refuses everything after the last member left', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const left = operation(
      CommunityOperationAction.MEMBER_LEFT,
      owner,
      { identityId: owner.valueOf() },
      [created],
    );

    ledger.admit(created);
    ledger.admit(left);

    expect(() => ledger.admit(join([left], alice))).toThrow();
  });

  describe('demotion racing a moderation action across a partition', () => {
    const created = genesis();
    const joinedAlice = join([created], alice);
    const joinedMallory = join([joinedAlice], mallory);
    const roleId = CommunityRoleId.derive(
      communityId.valueOf(),
      owner.valueOf(),
      3,
    ).valueOf();
    const moderator = operation(
      CommunityOperationAction.ROLE_CREATED,
      owner,
      { name: 'moderator', permissions: ['ban_members'], roleId },
      [joinedMallory],
      3,
    );
    const promote = operation(
      CommunityOperationAction.MEMBER_ROLES_UPDATED,
      owner,
      { identityId: alice.valueOf(), roleIds: [roleId] },
      [moderator],
    );
    const demote = operation(
      CommunityOperationAction.MEMBER_ROLES_UPDATED,
      owner,
      { identityId: alice.valueOf(), roleIds: [] },
      [promote],
    );
    const history = [created, joinedAlice, joinedMallory, moderator, promote];

    it('still admits, whichever side arrives first, a ban authored while the moderator was one', () => {
      const banWhileModerator = ban([promote], mallory, alice);

      for (const arrival of [
        [demote, banWhileModerator],
        [banWhileModerator, demote],
      ]) {
        const ledger = new CommunityOperationLedger();

        history.forEach((entry) => ledger.admit(entry));

        expect(() =>
          arrival.forEach((entry) => ledger.admit(entry)),
        ).not.toThrow();
      }
    });

    it('refuses a ban that builds on the demotion', () => {
      const ledger = new CommunityOperationLedger();

      [...history, demote].forEach((entry) => ledger.admit(entry));

      expect(() => ledger.admit(ban([demote], mallory, alice))).toThrow();
    });
  });
});
