import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidProfileHandleError } from '../errors/InvalidProfileHandleError';

export class ProfileHandle extends StringValueObject {
  private static readonly MAX_LENGTH = 32;
  private static readonly MIN_LENGTH = 3;
  private static readonly VALID_HANDLE = /^[a-z0-9._-]+$/;

  private static normalize(value: string | StringValueObject): string {
    return value.valueOf().toLowerCase();
  }

  constructor(value: string | StringValueObject) {
    super(ProfileHandle.normalize(value), ProfileHandle.MAX_LENGTH);

    assert(this.isValid(), new InvalidProfileHandleError());
  }

  private isValid(): boolean {
    return (
      this.value.length >= ProfileHandle.MIN_LENGTH &&
      ProfileHandle.VALID_HANDLE.test(this.value)
    );
  }
}
