import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PostNotificationBody {
  @IsString()
  @IsNotEmpty()
  public readonly conversationId: string;

  @IsString()
  @IsNotEmpty()
  public readonly encryptedConversationKey: string;

  @IsString()
  @IsNotEmpty()
  public readonly inviterIdentityId: string;

  @IsOptional()
  @IsString()
  public readonly keyEncryptionAlgorithm?: string;

  @IsString()
  @IsNotEmpty()
  public readonly recipientIdentityId: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;

  @IsString()
  @IsIn(['conversation_invitation'])
  public readonly type: 'conversation_invitation';
}
