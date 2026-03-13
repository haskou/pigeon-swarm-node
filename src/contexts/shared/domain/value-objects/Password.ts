import { assert, StringValueObject } from '@haskou/value-objects';

// TODO: Test
export class Password extends StringValueObject {
  private static readonly MIN_LENGTH = 8;

  constructor(value: string | StringValueObject) {
    super(value);

    // TODO: Add error
    assert(
      this.isValidPassword(),
      `Password must be at least ${Password.MIN_LENGTH} characters long.`,
    );
  }

  private isValidPassword(): boolean {
    return this.value.length >= Password.MIN_LENGTH;
  }
}
