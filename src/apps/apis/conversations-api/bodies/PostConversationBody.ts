import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { ConversationOperationBody } from './ConversationOperationBody';

export class PostConversationBody {
  @IsString()
  @IsNotEmpty()
  public readonly keychainExternalIdentifier: string;

  @IsString()
  @IsNotEmpty()
  public readonly networkId: string;

  @ValidateIf((body: PostConversationBody) => body.type === 'group')
  @IsString()
  @IsNotEmpty()
  public readonly name?: string;

  @ValidateIf((body: PostConversationBody) => body.type === 'group')
  @IsString()
  @IsNotEmpty()
  public readonly nonce?: string;

  @Type(() => ConversationOperationBody)
  @ValidateNested()
  public readonly operation: ConversationOperationBody;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  public readonly participantIds: string[];

  @IsString()
  @IsIn(['group', 'one-to-one'])
  public readonly type: 'group' | 'one-to-one';
}
