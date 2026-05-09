import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class PostConversationBody {
  @IsString()
  @IsNotEmpty()
  public readonly keychainExternalIdentifier: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  public readonly participantIdentityIds: string[];

  @IsString()
  @IsIn(['one-to-one'])
  public readonly type: 'one-to-one';
}
