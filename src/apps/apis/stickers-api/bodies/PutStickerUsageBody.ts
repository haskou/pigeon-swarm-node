import { IsInt, IsObject, Min } from 'class-validator';

export class PutStickerUsageBody {
  @IsInt()
  @Min(0)
  public readonly usedAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
