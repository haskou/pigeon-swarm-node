import { CommunityOperationLedger } from '@app/contexts/communities/domain/operations/CommunityOperationLedger';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';

import {
  alice,
  ban,
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
});
