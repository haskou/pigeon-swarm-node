import { IsInt, Min } from 'class-validator';

export class PostPrivateBlobBody {
  @IsInt()
  @Min(1)
  public readonly size: number;
}
