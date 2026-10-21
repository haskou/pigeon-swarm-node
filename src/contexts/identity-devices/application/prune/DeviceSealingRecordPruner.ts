import { DeviceSealingRecordRepository } from '../../domain/repositories/DeviceSealingRecordRepository';

export default class DeviceSealingRecordPruner {
  constructor(private readonly records: DeviceSealingRecordRepository) {}

  public async prune(now: Date = new Date()): Promise<void> {
    await this.records.pruneExpired(now);
  }
}
