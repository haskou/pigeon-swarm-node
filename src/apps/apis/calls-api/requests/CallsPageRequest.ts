import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CallPosition } from '@app/contexts/calls/application/pagination/CallPosition';

/** One page of a calls list, read after the position of its cursor. */
export class CallsPageRequest {
  constructor(
    private readonly resource: 'calls' | 'past-calls',
    private readonly limit: unknown,
    private readonly cursor: string | undefined,
  ) {}

  public getLimit(): number {
    return PageLimit.parse(this.limit);
  }

  /** The call to read after: the position of a decoded cursor, which must be a call position. */
  public getAfterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.resource);

    if (!CallPosition.isValid(position)) {
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
