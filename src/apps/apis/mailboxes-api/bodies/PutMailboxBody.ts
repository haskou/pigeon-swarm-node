import { Matches } from 'class-validator';

export class PutMailboxBody {
  @Matches(/^[0-9a-f]{64}$/)
  public readonly postTokenHash: string;

  @Matches(/^[0-9a-f]{64}$/)
  public readonly readTokenHash: string;

  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  public readonly creationNonce: string;
}
