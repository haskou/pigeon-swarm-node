export class PublishedContent {
  public readonly cid!: string;
  public readonly contentType!: string;
  public readonly encrypted?: true;
  public readonly filename?: string;
  public readonly size!: number;
}
