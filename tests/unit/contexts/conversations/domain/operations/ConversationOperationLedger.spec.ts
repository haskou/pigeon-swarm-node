import { InvalidConversationOperationError } from '@app/contexts/conversations/domain/errors/InvalidConversationOperationError';
import { ConversationOperationLedger } from '@app/contexts/conversations/domain/operations/ConversationOperationLedger';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';

import {
  add,
  alice,
  bob,
  creator,
  leave,
  mallory,
  oneToOneGenesis,
  operation,
  promote,
  remove,
} from './ConversationOperationFixtures';

describe('ConversationOperationLedger', () => {
  it('admits the genesis of a 1:1 conversation', () => {
    expect(() =>
      new ConversationOperationLedger().admit(oneToOneGenesis()),
    ).not.toThrow();
  });

  it('refuses a 1:1 creation that does not list its author', () => {
    const forged = operation(
      ConversationOperationAction.CONVERSATION_CREATED,
      bob,
      {
        participantIds: [creator.valueOf(), alice.valueOf()],
        type: 'one-to-one',
      },
      [],
    );

    expect(() => new ConversationOperationLedger().admit(forged)).toThrow(
      InvalidConversationOperationError,
    );
  });

  it('refuses every change of a 1:1 conversation', () => {
    const ledger = new ConversationOperationLedger();
    const created = oneToOneGenesis();

    ledger.admit(created);

    expect(() => ledger.admit(leave([created], alice))).toThrow();
    expect(() => ledger.admit(add([created], bob))).toThrow();
    expect(() => ledger.admit(remove([created], alice))).toThrow();
    expect(() => ledger.admit(promote([created], alice))).toThrow();
    expect(() => ledger.admit(add([created], bob, mallory))).toThrow();
  });

  it('admits the same creation twice', () => {
    const ledger = new ConversationOperationLedger();
    const created = oneToOneGenesis();

    ledger.admit(created);

    expect(() => ledger.admit(created)).not.toThrow();
  });
});
