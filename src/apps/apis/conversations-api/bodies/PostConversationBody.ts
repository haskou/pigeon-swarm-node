import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateIf,
} from 'class-validator';

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

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  public readonly participantIds: string[];

  @IsString()
  @IsIn(['group', 'one-to-one'])
  public readonly type: 'group' | 'one-to-one';
}
