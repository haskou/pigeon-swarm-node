import { IsString, MaxLength } from 'class-validator';

export class PostPrivateAuthorizationChallengeBody {
  @IsString()
  @MaxLength(262_144)
  public readonly signedOperationJson: string;
}
