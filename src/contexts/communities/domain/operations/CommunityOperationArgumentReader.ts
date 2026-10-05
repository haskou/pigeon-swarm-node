import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityOperationArguments } from './CommunityOperationArguments';

/**
 * Strict reader of operation arguments: every action declares the exact keys
 * it accepts, so a signed operation cannot smuggle extra data.
 */
export class CommunityOperationArgumentReader {
  constructor(
    private readonly args: CommunityOperationArguments,
    required: string[],
    optional: string[] = [],
  ) {
    const keys = Object.keys(args);

    if (
      required.some((key) => !Object.hasOwn(args, key)) ||
      keys.some((key) => !required.includes(key) && !optional.includes(key))
    ) {
      throw new InvalidCommunityOperationError();
    }
  }

  public boolean(key: string): boolean {
    const value = this.args[key];

    if (typeof value !== 'boolean') {
      throw new InvalidCommunityOperationError();
    }

    return value;
  }

  public optionalBoolean(key: string): boolean | undefined {
    return this.args[key] === undefined ? undefined : this.boolean(key);
  }

  public optionalString(key: string): string | undefined {
    return this.args[key] === undefined ? undefined : this.string(key);
  }

  public string(key: string): string {
    const value = this.args[key];

    if (typeof value !== 'string') {
      throw new InvalidCommunityOperationError();
    }

    return value;
  }

  public stringArray(key: string): string[] {
    const value = this.args[key];

    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string')
    ) {
      throw new InvalidCommunityOperationError();
    }

    return value as string[];
  }
}
