import { InvalidPageCursorError } from '../errors/InvalidPageCursorError';
import { PageCursor } from './PageCursor';
import { PageLimit } from './PageLimit';

/**
 * One page of a list, read after the position its cursor carries. `parse`
 * throws for any position the list could not have produced, which refuses the
 * cursor before the list is read.
 */
export class PageRequest {
  constructor(
    private readonly resource: string,
    private readonly limit: unknown,
    private readonly cursor: string | undefined,
    private readonly parse: (position: string) => unknown,
  ) {}

  public getLimit(): number {
    return PageLimit.parse(this.limit);
  }

  /** The position to read after, or undefined for the first page. */
  public getAfterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.resource);

    try {
      this.parse(position);
    } catch {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The cursor reading after `nextPosition`, or null when the list ends. */
  public nextCursor(nextPosition: string | undefined): string | null {
    return nextPosition === undefined
      ? null
      : PageCursor.encode({ position: nextPosition, resource: this.resource });
  }
}
