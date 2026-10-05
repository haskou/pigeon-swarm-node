import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';

import { StickerPackMother } from '../../../mothers/StickerPackMother';

describe('StickerUserLibrary', () => {
  const identityId = StickerPackMother.ownerIdentityId;

  it('records a creation event', () => {
    const library = StickerUserLibrary.create(new IdentityId(identityId));
    const events = library.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0].eventName()).toBe('stickers.v1.user_library.was_created');
  });

  it('projects only the ten most recently used stickers, newest first', () => {
    const library = StickerUserLibrary.fromPrimitives({
      favoriteStickers: [],
      identityId,
      recentStickers: Array.from({ length: 12 }, (_, index) => ({
        packId: 'pack-1',
        stickerId: `sticker-${index}`,
        usedAt: 1780000000000 + index,
      })),
      savedPackIds: [],
    });
    const recents = library.toPrimitives().recentStickers;

    expect(recents).toHaveLength(10);
    expect(recents[0].stickerId).toBe('sticker-11');
    expect(recents[9].stickerId).toBe('sticker-2');
  });
});
