import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

import { ConversationOperationBody } from './ConversationOperationBody';

export class PostConversationMemberBody {
  @IsString()
  @IsNotEmpty()
  public readonly identityId: string;

  @Type(() => ConversationOperationBody)
  @ValidateNested()
  public readonly operation: ConversationOperationBody;
}
