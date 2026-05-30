import { IsOptional, IsString } from 'class-validator';

export class PostPushTestBody {
  @IsOptional()
  @IsString()
  public readonly endpoint?: string;
}
