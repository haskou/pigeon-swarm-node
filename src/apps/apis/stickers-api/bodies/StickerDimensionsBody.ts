import { IsInt } from 'class-validator';

export class StickerDimensionsBody {
  @IsInt()
  public readonly height: number;

  @IsInt()
  public readonly width: number;
}
