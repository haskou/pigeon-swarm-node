import { StickerPackResource } from './StickerPackResource';

export interface StickerPacksResource {
  nextCursor: string | null;
  results: StickerPackResource[];
}
