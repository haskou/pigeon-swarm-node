import { IsIn, IsNotEmpty, IsString } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  public readonly recipientIdentityId: string;

  @IsString()
  @IsNotEmpty()
  public readonly inviterSignature: string;

  @IsString()
  @IsIn(['conversation_invitation'])
  public readonly type: 'conversation_invitation';
}
