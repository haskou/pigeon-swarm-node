import { IsNotEmpty, IsString } from 'class-validator';

export class PostLinkPreviewBody {
  @IsString()
  @IsNotEmpty()
  public readonly url: string;
}
