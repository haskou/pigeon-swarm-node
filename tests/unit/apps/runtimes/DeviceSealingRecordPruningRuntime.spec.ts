import DeviceSealingRecordPruningRuntime from '@app/apps/runtimes/device-sealing-record-pruning-runtime/DeviceSealingRecordPruningRuntime';
import DeviceSealingRecordPruner from '@app/contexts/identity-devices/application/prune/DeviceSealingRecordPruner';
import Kernel from '@haskou/ddd-kernel';
import { mock } from 'jest-mock-extended';

const ONE_HOUR_MS = 3_600_000;

class LeakyPrunerError extends Error {
  public override readonly name = 'LeakyPrunerError';
}

describe('DeviceSealingRecordPruningRuntime', () => {
  beforeEach(() => {
    new Kernel({
      logger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    });
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-02T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prunes right after start without holding the start up', async () => {
    const pruner = mock<DeviceSealingRecordPruner>();
    pruner.prune.mockResolvedValue();

    await new DeviceSealingRecordPruningRuntime(pruner).run();

    expect(pruner.prune).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    expect(pruner.prune).toHaveBeenCalledTimes(1);
    expect(pruner.prune).toHaveBeenCalledWith(
      new Date('2026-05-02T12:00:00.000Z'),
    );
  });

  it('prunes again every hour', async () => {
    const pruner = mock<DeviceSealingRecordPruner>();
    pruner.prune.mockResolvedValue();

    await new DeviceSealingRecordPruningRuntime(pruner).run();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(ONE_HOUR_MS - 1);
    expect(pruner.prune).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(pruner.prune).toHaveBeenCalledTimes(2);
  });

  it('runs one schedule however often it is started', async () => {
    const pruner = mock<DeviceSealingRecordPruner>();
    pruner.prune.mockResolvedValue();
    const runtime = new DeviceSealingRecordPruningRuntime(pruner);

    await runtime.run();
    await runtime.run();
    await jest.advanceTimersByTimeAsync(0);

    expect(pruner.prune).toHaveBeenCalledTimes(1);
  });

  it('logs only the error class of a failed prune and keeps pruning', async () => {
    const pruner = mock<DeviceSealingRecordPruner>();
    pruner.prune
      .mockRejectedValueOnce(new LeakyPrunerError('device-sealing-record:id'))
      .mockResolvedValue();

    await new DeviceSealingRecordPruningRuntime(pruner).run();
    await jest.advanceTimersByTimeAsync(0);

    expect(Kernel.logger.warn).toHaveBeenCalledWith(
      'Device sealing record pruning failed: error=LeakyPrunerError',
    );
    await jest.advanceTimersByTimeAsync(ONE_HOUR_MS);
    expect(pruner.prune).toHaveBeenCalledTimes(2);
  });
});
