export class ContentGetResult {
  public static binary(params: {
    bytes: Buffer;
    contentType: string;
    filename?: string;
  }): ContentGetResult {
    return new ContentGetResult(
      'binary',
      params.bytes,
      params.contentType,
      params.filename,
    );
  }

  public static json(content: unknown): ContentGetResult {
    return new ContentGetResult(
      'json',
      undefined,
      undefined,
      undefined,
      content,
    );
  }

  private constructor(
    private readonly kind: 'binary' | 'json',
    private readonly bytes?: Buffer,
    private readonly contentType?: string,
    private readonly filename?: string,
    private readonly content?: unknown,
  ) {}

  public getBinaryResponse(): {
    bytes: Buffer;
    contentType: string;
    filename?: string;
  } {
    if (!this.isBinary() || !this.bytes || !this.contentType) {
      throw new Error('Content result is not binary.');
    }

    return {
      bytes: this.bytes,
      contentType: this.contentType,
      filename: this.filename,
    };
  }

  public getJsonResponse(): unknown {
    return this.content;
  }

  public isBinary(): boolean {
    return this.kind === 'binary';
  }
}
