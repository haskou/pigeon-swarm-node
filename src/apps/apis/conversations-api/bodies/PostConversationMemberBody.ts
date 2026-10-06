import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';

import { ConversationOperationBody } from './ConversationOperationBody';

export class PostConversationMemberBody {
  @IsString()
  @IsNotEmpty()
  public readonly identityId: string;

  @IsObject()
  @Type(() => ConversationOperationBody)
  @ValidateNested()
  public readonly operation: ConversationOperationBody;
}
