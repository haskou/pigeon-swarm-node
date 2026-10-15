import { IsArray, IsString } from 'class-validator';

export class PutNodeBlockExceptionsBody {
  @IsArray()
  @IsString({ each: true })
  public readonly identityIds!: string[];

  @IsArray()
  @IsString({ each: true })
  public readonly nodePeerIds!: string[];
}
