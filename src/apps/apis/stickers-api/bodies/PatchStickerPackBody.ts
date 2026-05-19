import { IsString } from 'class-validator';

export class PatchStickerPackBody {
  @IsString()
  public readonly name: string;
}
