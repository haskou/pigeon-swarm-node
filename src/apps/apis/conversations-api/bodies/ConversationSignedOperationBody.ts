import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { ConversationOperationBody } from './ConversationOperationBody';

/** Body of the endpoints whose only input is the signed operation. */
export class ConversationSignedOperationBody {
  @Type(() => ConversationOperationBody)
  @ValidateNested()
  public readonly operation: ConversationOperationBody;
}
