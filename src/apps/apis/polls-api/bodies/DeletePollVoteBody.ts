import { IsObject } from 'class-validator';

export class DeletePollVoteBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
