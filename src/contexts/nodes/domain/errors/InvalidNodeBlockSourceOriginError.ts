import { DomainError } from '@haskou/value-objects';

/** An adopted source is fetched from a bare https origin only. */
export class InvalidNodeBlockSourceOriginError extends DomainError {
  constructor() {
    super(
      'Node block source origin must be an https origin without credentials, path, query or fragment.',
    );
  }
}
