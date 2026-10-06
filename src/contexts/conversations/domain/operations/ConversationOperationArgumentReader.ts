import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperationArguments } from './ConversationOperationArguments';

/**
 * Strict reader of operation arguments: every action declares the exact keys
 * it accepts, so a signed operation cannot smuggle extra data.
 */
export class ConversationOperationArgumentReader {
  constructor(
    private readonly args: ConversationOperationArguments,
    required: string[],
    optional: string[] = [],
  ) {
    const keys = Object.keys(args);

    if (
      required.some((key) => !Object.hasOwn(args, key)) ||
      keys.some((key) => !required.includes(key) && !optional.includes(key))
    ) {
      throw new InvalidConversationOperationError();
    }
  }

  public string(key: string): string {
    const value = this.args[key];

    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidConversationOperationError();
    }

    return value;
  }

  public stringArray(key: string): string[] {
    const value = this.args[key];

    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string' || entry.length === 0)
    ) {
      throw new InvalidConversationOperationError();
    }

    return value as string[];
  }
}
