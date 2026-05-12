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

  @IsString()
  @IsNotEmpty()
  public readonly networkId: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  public readonly participantIds: string[];

  @IsString()
  @IsIn(['one-to-one'])
  public readonly type: 'one-to-one';
}
