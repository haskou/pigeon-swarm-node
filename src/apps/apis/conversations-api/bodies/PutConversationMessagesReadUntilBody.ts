import { IsNotEmpty, IsString } from 'class-validator';

export class PutConversationMessagesReadUntilBody {
  @IsString()
  @IsNotEmpty()
  public readonly messageId: string;
}
