import { DomainError } from '@haskou/value-objects';

/** The owner approved entries of a version that is no longer the latest one. */
export class NodeBlockSourceVersionHasChangedError extends DomainError {
  constructor() {
    super(
      'Node block source has a newer version; review its pending entries again.',
    );
  }
}
