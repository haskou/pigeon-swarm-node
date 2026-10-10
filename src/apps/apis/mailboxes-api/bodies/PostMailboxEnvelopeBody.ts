import { IsString, Matches, MaxLength } from 'class-validator';

export class PostMailboxEnvelopeBody {
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  public readonly envelopeId: string;

  @IsString()
  @MaxLength(87_382)
  public readonly body: string;
}
