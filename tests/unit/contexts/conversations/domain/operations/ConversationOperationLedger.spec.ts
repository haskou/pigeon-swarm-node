import { InvalidConversationOperationError } from '@app/contexts/conversations/domain/errors/InvalidConversationOperationError';
import { ConversationOperationLedger } from '@app/contexts/conversations/domain/operations/ConversationOperationLedger';

import {
  add,
  alice,
  bob,
  carol,
  creator,
  groupGenesis,
  leave,
  mallory,
  oneToOneGenesis,
  promote,
  remove,
} from './ConversationOperationFixtures';

describe('ConversationOperationLedger', () => {
  it('admits operations in the history they build on', () => {
    const ledger = new ConversationOperationLedger();
    const created = groupGenesis();
    const promoted = promote([created], alice);

    expect(() => {
      ledger.admit(created);
      ledger.admit(promoted);
      ledger.admit(add([promoted], bob, alice));
      ledger.admit(leave([promoted], alice));
    }).not.toThrow();
  });

  it('refuses a forged creation, a forged add and a forged removal', () => {
    const ledger = new ConversationOperationLedger();
    const created = groupGenesis();

    ledger.admit(created);

    expect(() => ledger.admit(add([created], bob, alice))).toThrow(
      InvalidConversationOperationError,
    );
    expect(() => ledger.admit(add([created], bob, mallory))).toThrow(
      InvalidConversationOperationError,
    );
    expect(() => ledger.admit(remove([created], creator, alice))).toThrow(
      InvalidConversationOperationError,
    );
    expect(() => ledger.admit(promote([created], alice, alice))).toThrow(
      InvalidConversationOperationError,
    );
  });

  it('refuses a creation that does not list its author', () => {
    const forged = groupGenesis([alice, bob]);

    expect(() => new ConversationOperationLedger().admit(forged)).toThrow(
      InvalidConversationOperationError,
    );
  });

  it('refuses every change of a 1:1 conversation', () => {
    const ledger = new ConversationOperationLedger();
    const created = oneToOneGenesis();

    ledger.admit(created);

    expect(() => ledger.admit(leave([created], alice))).toThrow();
  });

  it('refuses an operation whose parents are unknown, then admits it once they arrive', () => {
    const ledger = new ConversationOperationLedger();
    const created = groupGenesis();
    const first = add([created], bob);
    const next = add([first], carol);

    ledger.admit(created);
    expect(() => ledger.admit(next)).toThrow(InvalidConversationOperationError);

    ledger.admit(first);

    expect(() => ledger.admit(next)).not.toThrow();
  });

  it('authorizes an operation against the merged history of several parents', () => {
    const ledger = new ConversationOperationLedger();
    const created = groupGenesis();
    const addedBob = add([created], bob);
    const addedCarol = add([created], carol);

    [created, addedBob, addedCarol].forEach((operation) =>
      ledger.admit(operation),
    );

    expect(() =>
      ledger.admit(remove([addedBob, addedCarol], carol)),
    ).not.toThrow();
  });

  it('refuses a creation twice under the same history only once', () => {
    const ledger = new ConversationOperationLedger();
    const created = groupGenesis();

    ledger.admit(created);

    expect(() => ledger.admit(created)).not.toThrow();
  });
});
