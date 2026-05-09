import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PostConversationMessageBody {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly attachmentExternalIdentifiers?: string[];

  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
