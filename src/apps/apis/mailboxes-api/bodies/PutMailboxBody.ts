import { Matches } from 'class-validator';

export class PutMailboxBody {
  @Matches(/^[0-9a-f]{64}$/)
  public readonly postTokenHash: string;

  @Matches(/^[0-9a-f]{64}$/)
  public readonly readTokenHash: string;

  @Matches(/^(0|[1-9][0-9]{0,15})$/)
  public readonly creationNonce: string;
}
