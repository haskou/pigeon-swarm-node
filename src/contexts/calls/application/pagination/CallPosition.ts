import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { Call } from '../../domain/Call';
import { CallId } from '../../domain/value-objects/CallId';

/**
 * The page position of a call: when it was created, then its id, so calls
 * created in the same millisecond keep a stable order. Oldest first.
 */
export class CallPosition {
  private static readonly SEPARATOR = '|';

  public static of(call: Call): string {
    const { createdAt, id } = call.toPrimitives();

    return `${PageTimestamp.of(createdAt)}${CallPosition.SEPARATOR}${id}`;
  }

  /** Whether `position` is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const separator = position.indexOf(CallPosition.SEPARATOR);

    if (separator === -1) return false;

    try {
      new CallId(position.slice(separator + 1));
    } catch {
      return false;
    }

    return PageTimestamp.isValid(position.slice(0, separator));
  }
}
