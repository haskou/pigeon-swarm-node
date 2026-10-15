import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

enum PostCallScopeType {
  COMMUNITY_CHANNEL = 'community_channel',
  CONVERSATION = 'conversation',
  GROUP_CAPABILITY = 'group_capability',
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

  /** SHA-256 of the MLS-derived capability; the capability never reaches the node at start. */
  @ValidateIf((body: PostCallBody) => body.scopeType === 'group_capability')
  @Matches(/^[0-9a-f]{64}$/)
  public readonly capabilityHash?: string;

  @ValidateIf((body: PostCallBody) => body.scopeType === 'group_capability')
  @IsUUID()
  public readonly networkId?: string;

  @IsString()
  @IsNotEmpty()
  public readonly nonce: string;

  @IsInt()
  @Min(0)
  public readonly startedAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
