import { IsObject } from 'class-validator';

export class StickerMutationBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
