import { IsObject, IsString } from 'class-validator';

/** The joiner's proofs, and the signed `requests` put that stores them. */
export class PostCommunityInvitationClaimBody {
  @IsString()
  public readonly consent: string;

  @IsString()
  public readonly possession: string;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
