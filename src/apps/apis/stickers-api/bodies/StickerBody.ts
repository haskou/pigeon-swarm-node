import { IsInt, IsObject, IsString, ValidateNested } from 'class-validator';

import { StickerDimensionsBody } from './StickerDimensionsBody';

export class StickerBody {
  @IsString()
  public readonly assetCid: string;

  @IsString()
  public readonly contentType: string;

  @IsObject()
  @ValidateNested()
  public readonly dimensions: StickerDimensionsBody;

  @IsInt()
  public readonly sizeBytes: number;

  @IsString()
  public readonly type: string;
}
