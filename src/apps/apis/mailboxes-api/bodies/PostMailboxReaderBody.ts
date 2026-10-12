import { Matches } from 'class-validator';

export class PostMailboxReaderBody {
  @Matches(/^[0-9a-f]{64}$/)
  public readonly readTokenHash: string;
}
