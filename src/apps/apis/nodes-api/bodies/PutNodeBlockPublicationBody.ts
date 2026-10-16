import { IsBoolean } from 'class-validator';

export class PutNodeBlockPublicationBody {
  @IsBoolean()
  public readonly published!: boolean;
}
