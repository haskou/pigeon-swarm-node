import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PostNodeNetworkBody {
  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsString()
  @IsNotEmpty()
  public readonly name: string;

  @IsOptional()
  @IsString()
  public readonly key?: string;
}
