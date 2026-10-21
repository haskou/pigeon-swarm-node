import DeviceSealingRecordPruner from '@app/contexts/identity-devices/application/prune/DeviceSealingRecordPruner';
import { DeviceSealingRecordRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealingRecordRepository';
import { mock } from 'jest-mock-extended';

describe(DeviceSealingRecordPruner.name, () => {
  it('prunes the records that are no longer current at the given instant', async () => {
    const records = mock<DeviceSealingRecordRepository>();
    const now = new Date('2026-05-04T00:00:00.000Z');

    await new DeviceSealingRecordPruner(records).prune(now);

    expect(records.pruneExpired).toHaveBeenCalledWith(now);
  });
});
