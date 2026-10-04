import { IsInt, IsObject, IsString, Min } from 'class-validator';

export class PatchStickerPackBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsString()
  public readonly name: string;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;
}
