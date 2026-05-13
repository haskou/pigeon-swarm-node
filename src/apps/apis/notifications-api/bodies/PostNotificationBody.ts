import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PostNotificationBody {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly communityId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly conversationId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly encryptedCommunityKey?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly encryptedConversationKey?: string;

  @IsString()
  @IsNotEmpty()
  public readonly inviterIdentityId: string;

  @IsString()
  @IsNotEmpty()
  public readonly recipientIdentityId: string;

  @IsString()
  @IsNotEmpty()
  public readonly inviterSignature: string;

  @IsString()
  @IsIn(['community_invitation', 'conversation_invitation'])
  public readonly type: 'community_invitation' | 'conversation_invitation';
}
