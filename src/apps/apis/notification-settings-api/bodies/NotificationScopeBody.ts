import { IsIn, IsOptional, IsString } from 'class-validator';

const scopeTypes = ['conversation', 'community', 'community_channel'];

export class NotificationScopeBody {
  @IsOptional()
  @IsString()
  public readonly channelId?: string;

  @IsOptional()
  @IsString()
  public readonly communityId?: string;

  @IsOptional()
  @IsString()
  public readonly conversationId?: string;

  @IsIn(scopeTypes)
  public readonly type: string;
}
