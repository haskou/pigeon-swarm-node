import { CommitmentId, MlsRecordContent } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

export class MLSRecordId extends StringValueObject {
  /**
   * Content-bound id. Nobody can claim an id for content they did not write,
   * so a record cannot be front-run, and republishing the same record is
   * idempotent.
   */
  public static derive(content: MlsRecordContent): MLSRecordId {
    return new MLSRecordId(CommitmentId.mlsRecord(content));
  }
}
