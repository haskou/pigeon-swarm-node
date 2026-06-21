import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CommunityMessageMentionBody {
  @IsOptional()
  @IsString()
  public readonly targetId?: string;

  @IsString()
  @IsNotEmpty()
  public readonly type: string;
}
