import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PutConversationDraftBody {
  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsOptional()
  @IsInt()
  public readonly updatedAt?: number;
}
