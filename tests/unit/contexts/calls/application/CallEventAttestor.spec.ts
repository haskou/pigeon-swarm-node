import CallEventAttestor from '@app/contexts/calls/application/attest-event/CallEventAttestor';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { callStartArgs } from '../../../../support/signCall';

const creator = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
const callee = new IdentityId(
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
);

function newCall(): Call {
  return Call.start(
    creator,
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
    CallScope.conversation(new ConversationId('one-to-one:attestor')),
    [callee],
    ...callStartArgs(),
  );
}

describe('CallEventAttestor', () => {
  it('drops an event of a call this node never admitted', async () => {
    const call = newCall();
    const [started] = call.pullDomainEvents();
    const repository = {
      awaitUpdate: jest.fn().mockResolvedValue(false),
      findById: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new CallEventAttestor(repository as never).attest(started),
    ).resolves.toBeUndefined();
    expect(repository.awaitUpdate).toHaveBeenCalledTimes(1);
  });

  it('accepts an event once the signed records are admitted after the announcement', async () => {
    const call = newCall();
    const [started] = call.pullDomainEvents();
    const repository = {
      awaitUpdate: jest.fn().mockResolvedValue(true),
      findById: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(call),
    };
    const attested = await new CallEventAttestor(repository as never).attest(
      started,
    );

    expect(attested).toBeInstanceOf(CallStartedEvent);
  });

  it('drops an event whose aggregate is not a call id', async () => {
    const repository = { awaitUpdate: jest.fn(), findById: jest.fn() };
    const bogus = new CallStartedEvent('not-a-uuid', {});

    await expect(
      new CallEventAttestor(repository as never).attest(bogus),
    ).resolves.toBeUndefined();
    expect(repository.findById).not.toHaveBeenCalled();
  });
});
