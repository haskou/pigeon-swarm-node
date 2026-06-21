import { StickerUserLibrary } from '../domain/StickerUserLibrary';

export class StickerUserLibraryLookup {
  public static existing(
    library: StickerUserLibrary,
  ): StickerUserLibraryLookup {
    return new StickerUserLibraryLookup(false, library);
  }

  public static created(library: StickerUserLibrary): StickerUserLibraryLookup {
    return new StickerUserLibraryLookup(true, library);
  }

  private constructor(
    public readonly created: boolean,
    public readonly library: StickerUserLibrary,
  ) {}
}
