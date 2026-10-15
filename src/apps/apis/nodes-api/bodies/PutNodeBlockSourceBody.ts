import { IsBoolean, IsString } from 'class-validator';

export class PutNodeBlockSourceBody {
  @IsString()
  public readonly origin!: string;

  @IsBoolean()
  public readonly autoApply!: boolean;
}
