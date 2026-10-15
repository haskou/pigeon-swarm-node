import { DomainError } from '@haskou/value-objects';

import { NodeBlockSourceFetchOutcome } from '../value-objects/NodeBlockSourceFetchOutcome';

/** A source's document could not be downloaded or read; the outcome says why. */
export class NodeBlockSourceFetchFailedError extends DomainError {
  constructor(public readonly outcome: NodeBlockSourceFetchOutcome) {
    super(`Node block source fetch failed: ${outcome.valueOf()}.`);
  }
}
