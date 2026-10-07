import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

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

  @ValidateIf((body: PostCallBody) => body.scopeType === 'community_channel')
  @IsInt()
  @Min(1)
  public readonly sessionEpoch?: number;

  @IsString()
  @IsNotEmpty()
  public readonly nonce: string;

  @IsInt()
  @Min(0)
  public readonly startedAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
