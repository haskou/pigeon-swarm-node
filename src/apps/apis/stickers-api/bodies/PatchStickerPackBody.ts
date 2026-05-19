import { IsString } from 'class-validator';

export class PatchStickerPackBody {
  @IsString()
  public readonly description: string;

  @IsString()
  public readonly name: string;
}
