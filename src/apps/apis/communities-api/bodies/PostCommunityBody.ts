import { IsOptional, IsString } from 'class-validator';

export class PostCommunityBody {
  @IsOptional()
  @IsString()
  public readonly banner?: string;

  @IsString()
  public readonly description: string;

  @IsString()
  public readonly name: string;

  @IsString()
  public readonly networkId: string;
}
