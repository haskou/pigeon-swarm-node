import { IsNotEmpty, IsString } from 'class-validator';

export class ConversationMessageReactionBody {
  @IsString()
  @IsNotEmpty()
  public readonly emoji: string;
}
