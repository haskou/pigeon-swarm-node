import { Timestamp } from '@haskou/value-objects';

import { NodeBlockSourceFetch } from './NodeBlockSourceFetch';
import { NodeBlockSourceFetchPrimitives } from './NodeBlockSourceFetchPrimitives';
import { NodeBlockSourceFetchOutcome } from './value-objects/NodeBlockSourceFetchOutcome';

/** When an adopted source was last fetched and how it ended; never where from. */
export class RecordedNodeBlockSourceFetch extends NodeBlockSourceFetch {
  public static fromPrimitives(
    primitives: NodeBlockSourceFetchPrimitives,
  ): RecordedNodeBlockSourceFetch {
    return new RecordedNodeBlockSourceFetch(
      new Timestamp(primitives.at),
      NodeBlockSourceFetchOutcome.fromPrimitives(primitives.outcome),
    );
  }

  constructor(
    private readonly at: Timestamp,
    private readonly outcome: NodeBlockSourceFetchOutcome,
  ) {
    super();
  }

  public wasBefore(threshold: Timestamp): boolean {
    return this.at.isBefore(threshold);
  }

  public toPrimitives(): NodeBlockSourceFetchPrimitives {
    return { at: this.at.valueOf(), outcome: this.outcome.valueOf() };
  }
}
