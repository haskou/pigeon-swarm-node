import { DeviceSealingRecord } from '../DeviceSealingRecord';

export abstract class DeviceSealingRecordRepository {
  /**
   * Admits the record under the identity's current authorization. Resolves
   * true when it was newly stored and false for an identical repeat; rejects
   * with DeviceSealingRecordRejectedError when it is not admitted and with
   * DeviceSealingRecordConflictError when the device already sealed that day
   * with another key.
   */
  public abstract publish(record: DeviceSealingRecord): Promise<boolean>;

  /** The admitted records of today and yesterday (UTC) for the identity. */
  public abstract findCurrent(identityId: string): DeviceSealingRecord[];

  /**
   * Forgets every record this node holds whose UTC day is neither today nor
   * yesterday at `now`, so held records stay bounded to two days.
   */
  public abstract pruneExpired(now: Date): Promise<void>;
}
