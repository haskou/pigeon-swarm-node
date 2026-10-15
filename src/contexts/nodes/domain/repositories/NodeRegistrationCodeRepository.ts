import { Timestamp } from '@haskou/value-objects';

import { NodeRegistrationCode } from '../NodeRegistrationCode';
import { NodeRegistrationCodeHash } from '../value-objects/NodeRegistrationCodeHash';
import { NodeRegistrationCodeId } from '../value-objects/NodeRegistrationCodeId';

/** Local registration codes. Writes are serialized so uses are never double spent. */
export default abstract class NodeRegistrationCodeRepository {
  public abstract save(code: NodeRegistrationCode): Promise<void>;

  public abstract findAll(): Promise<NodeRegistrationCode[]>;

  public abstract remove(id: NodeRegistrationCodeId): Promise<void>;

  /**
   * Removes the codes expired at `now`. Used-up codes stay until they expire
   * so a use reserved meanwhile can still be given back.
   */
  public abstract removeExpired(now: Timestamp): Promise<void>;

  /**
   * Atomically spends one use of the code with this hash when it is usable at
   * `now`; resolves undefined otherwise.
   */
  public abstract reserveUse(
    hash: NodeRegistrationCodeHash,
    now: Timestamp,
  ): Promise<NodeRegistrationCode | undefined>;

  /** Atomically gives one reserved use back; a code removed meanwhile stays removed. */
  public abstract releaseUse(id: NodeRegistrationCodeId): Promise<void>;
}
