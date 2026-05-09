import { IsNotEmpty, IsString } from 'class-validator';

export class PostOneToOneConversationBody {
  @IsString()
  @IsNotEmpty()
  public readonly keychainExternalIdentifier: string;

  @IsString()
  @IsNotEmpty()
  public readonly participantIdentityId: string;
}
