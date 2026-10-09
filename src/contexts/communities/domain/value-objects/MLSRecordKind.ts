import { StringValueObject } from '@haskou/value-objects';

export type MLSRecordKindType = 'key_package' | 'commit' | 'welcome';

export class MLSRecordKind extends StringValueObject {
  public static readonly KeyPackage = new MLSRecordKind('key_package');
  public static readonly Commit = new MLSRecordKind('commit');
  public static readonly Welcome = new MLSRecordKind('welcome');

  public static from(value: string): MLSRecordKind {
    if (!['key_package', 'commit', 'welcome'].includes(value)) {
      throw new Error(`Invalid MLSRecordKind: ${value}`);
    }
    return new MLSRecordKind(value as MLSRecordKindType);
  }

  public isKeyPackage(): boolean {
    return this.valueOf() === 'key_package';
  }

  public isCommit(): boolean {
    return this.valueOf() === 'commit';
  }

  public isWelcome(): boolean {
    return this.valueOf() === 'welcome';
  }
}
