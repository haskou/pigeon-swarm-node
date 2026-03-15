import { InvalidPasswordError } from '@app/contexts/shared/domain/errors/InvalidPasswordError';
import { assert, StringValueObject } from '@haskou/value-objects';

export class Password extends StringValueObject {
  private static readonly MIN_LENGTH = 8;

  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      this.isValidPassword(),
      new InvalidPasswordError(Password.MIN_LENGTH),
    );
  }

  private isValidPassword(): boolean {
    return this.value.length >= Password.MIN_LENGTH;
  }
}
