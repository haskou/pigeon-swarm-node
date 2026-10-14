import { Integer } from '@haskou/value-objects';

import { ContentReplication } from '../ContentReplication';

/** One registration waiting for budget, after its owner's smaller ones. */
export interface ContentReplicationBudgetClaim {
  /** Bytes its owner holds once this registration is served. */
  readonly ownerTotalBytes: Integer;
  readonly replication: ContentReplication;
}
