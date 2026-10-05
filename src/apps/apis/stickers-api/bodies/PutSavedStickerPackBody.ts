import { IsInt, IsObject, Min } from 'class-validator';

export class PutSavedStickerPackBody {
  @IsInt()
  @Min(0)
  public readonly savedAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
