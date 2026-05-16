import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CommunityChannelMessageReactionBody {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  public emoji!: string;
}
