import { IsString } from 'class-validator';

export class PostStickerPackBody {
  @IsString()
  public readonly name: string;
}
