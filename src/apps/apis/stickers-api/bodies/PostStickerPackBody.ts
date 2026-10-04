import { IsInt, IsObject, IsString, Min } from 'class-validator';

export class PostStickerPackBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsString()
  public readonly name: string;

  @IsString()
  public readonly packId: string;

  @IsObject()
  public readonly savedPackMutation: Record<string, unknown>;
}
