import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

enum PostCallScopeType {
  COMMUNITY_CHANNEL = 'community_channel',
  CONVERSATION = 'conversation',
}

export class PostCallBody {
  @IsEnum(PostCallScopeType)
  public readonly scopeType: PostCallScopeType;

  @ValidateIf((body: PostCallBody) => body.scopeType === 'conversation')
  @IsString()
  public readonly conversationId?: string;

  @ValidateIf((body: PostCallBody) => body.scopeType === 'community_channel')
  @IsString()
  public readonly communityId?: string;

  @ValidateIf((body: PostCallBody) => body.scopeType === 'community_channel')
  @IsString()
  public readonly channelId?: string;

  @ValidateIf((body: PostCallBody) => body.scopeType === 'conversation')
  @IsOptional()
  @IsString({ each: true })
  public readonly invitedParticipantIds?: string[];
}
