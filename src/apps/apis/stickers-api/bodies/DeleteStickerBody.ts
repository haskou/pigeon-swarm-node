import { IsInt, IsObject, Min } from 'class-validator';

export class DeleteStickerBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;
}
