import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class PostIdentityBody {
  @IsString()
  @IsNotEmpty()
  public readonly name: string;

  @IsString()
  @IsNotEmpty()
  public readonly password: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @IsNotEmpty()
  public readonly networks: string[];
}
