import { IsInt, IsObject, Min } from 'class-validator';

export class PutFavoriteStickerBody {
  @IsInt()
  @Min(0)
  public readonly favoritedAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
