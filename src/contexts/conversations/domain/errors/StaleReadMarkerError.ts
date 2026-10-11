import { DomainError } from '@haskou/value-objects';

/** The reader's marker already points at a later message. */
export class StaleReadMarkerError extends DomainError {
  constructor() {
    super('Stale read marker');
  }
}
