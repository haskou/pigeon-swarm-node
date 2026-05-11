import { DomainError } from '@haskou/value-objects';

export class InvalidProfileHandleError extends DomainError {
  constructor() {
    super(
      'Profile handle must contain 3 to 32 lowercase letters, numbers or underscores.',
    );
  }
}
