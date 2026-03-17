import { IsNotEmpty, IsString } from 'class-validator';

export class PostIdentityBody {
  @IsString()
  @IsNotEmpty()
  public readonly name: string;

  @IsString()
  @IsNotEmpty()
  public readonly password: string;
}
