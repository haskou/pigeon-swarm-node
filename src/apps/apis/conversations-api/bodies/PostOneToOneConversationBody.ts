import { IsNotEmpty, IsString } from 'class-validator';

export class PostOneToOneConversationBody {
  @IsString()
  @IsNotEmpty()
  public readonly firstParticipantIdentityId: string;

  @IsString()
  @IsNotEmpty()
  public readonly secondParticipantIdentityId: string;
}
