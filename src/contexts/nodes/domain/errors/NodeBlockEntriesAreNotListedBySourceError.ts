import { DomainError } from '@haskou/value-objects';

/** Only entries the source's latest version names can be approved. */
export class NodeBlockEntriesAreNotListedBySourceError extends DomainError {
  constructor() {
    super(
      'Approved entries must be listed by the latest version of the source.',
    );
  }
}
