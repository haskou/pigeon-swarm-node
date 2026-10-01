import { IsInt, IsObject, Min } from 'class-validator';

export class PostCommunityChannelMessagePinBody {
  @IsInt()
  @Min(0)
  public createdAt!: number;

  @IsObject()
  public mutation!: Record<string, unknown>;
}
