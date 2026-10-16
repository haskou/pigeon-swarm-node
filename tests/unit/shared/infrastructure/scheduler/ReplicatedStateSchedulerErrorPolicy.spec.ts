import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Kernel from '@haskou/ddd-kernel';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { mock } from 'jest-mock-extended';

describe('ReplicatedStateSchedulerErrorPolicy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log the process name and only the error class of a failed run', () => {
    const identityId = 'f'.repeat(64);
    const error = jest.fn();
    const scheduler = mock<Scheduler>();

    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ error } as unknown as typeof Kernel.logger);
    scheduler.getProcessName.mockReturnValue('mailbox-expiration');

    new ReplicatedStateSchedulerErrorPolicy().handle(
      new IdentityNotFoundError(identityId),
      scheduler,
    );

    expect(error.mock.calls).toEqual([
      ['Error on mailbox-expiration: error=IdentityNotFoundError'],
    ]);
  });
});
