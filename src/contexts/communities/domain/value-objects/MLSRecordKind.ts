import { StringValueObject } from '@haskou/value-objects';

import { InvalidMLSRecordError } from '../errors/InvalidMLSRecordError';

export class MLSRecordKind extends StringValueObject {
  private static readonly KINDS = ['commit', 'key_package', 'welcome'];

  constructor(value: string) {
    super(value);

    if (!MLSRecordKind.KINDS.includes(value)) {
      throw new InvalidMLSRecordError();
    }
  }

  public isWelcome(): boolean {
    return this.valueOf() === 'welcome';
  }

  public isCommit(): boolean {
    return this.valueOf() === 'commit';
  }
}
