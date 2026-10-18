import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { StickerPacksFindMessage } from '@app/contexts/stickers/application/find-packs/messages/StickerPacksFindMessage';
import { StickerPackPosition } from '@app/contexts/stickers/application/find-packs/StickerPackPosition';

/** One page of sticker packs, most recently updated first. */
export class GetStickerPacksRequest {
  private static readonly RESOURCE = 'stickers.packs';

  constructor(
    private readonly ownerIdentityId: string | undefined,
    private readonly limit: unknown,
    private readonly cursor: string | undefined,
  ) {}

  /** The pack to read after: the position of a decoded cursor, which must be a pack position. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(
      this.cursor,
      GetStickerPacksRequest.RESOURCE,
    );

    if (!StickerPackPosition.isValid(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  public getMessage(): StickerPacksFindMessage {
    return new StickerPacksFindMessage(
      this.ownerIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }

  /** The cursor reading after `nextPosition`, or null when the list ends. */
  public nextCursor(nextPosition: string | undefined): string | null {
    return nextPosition === undefined
      ? null
      : PageCursor.encode({
          position: nextPosition,
          resource: GetStickerPacksRequest.RESOURCE,
        });
  }
}
