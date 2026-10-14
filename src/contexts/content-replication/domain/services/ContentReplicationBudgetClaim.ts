import { Integer } from '@haskou/value-objects';

import { ContentReplication } from '../ContentReplication';

/** One registration waiting for budget, after its owner's smaller ones. */
export interface ContentReplicationBudgetClaim {
  readonly ownerHeldBytes: Integer;
  readonly replication: ContentReplication;
}
