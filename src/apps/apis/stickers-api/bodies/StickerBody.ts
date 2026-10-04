import {
  IsInt,
  IsObject,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { StickerDimensionsBody } from './StickerDimensionsBody';

export class StickerBody {
  @IsString()
  public readonly assetCid: string;

  @IsString()
  public readonly contentType: string;

  @IsObject()
  @ValidateNested()
  public readonly dimensions: StickerDimensionsBody;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsInt()
  public readonly sizeBytes: number;

  @IsString()
  public readonly type: string;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;
}
