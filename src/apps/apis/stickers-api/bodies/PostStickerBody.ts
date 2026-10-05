import { IsString } from 'class-validator';

import { StickerBody } from './StickerBody';

export class PostStickerBody extends StickerBody {
  @IsString()
  public readonly stickerId: string;
}
