import { IsInt, Min } from 'class-validator';

export class PostMailboxAckBody {
  @IsInt()
  @Min(0)
  public readonly upTo: number;
}
