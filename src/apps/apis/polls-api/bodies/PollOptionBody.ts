import { IsNotEmpty, IsString } from 'class-validator';

export class PollOptionBody {
  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsString()
  @IsNotEmpty()
  public readonly text: string;
}
