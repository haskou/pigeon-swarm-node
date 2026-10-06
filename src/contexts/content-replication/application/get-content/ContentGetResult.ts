export class ContentGetResult {
  public static binary(params: {
    bytes: Buffer;
    contentType: string;
    inline: boolean;
  }): ContentGetResult {
    return new ContentGetResult(
      'binary',
      params.bytes,
      params.contentType,
      params.inline,
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
    private readonly inline?: boolean,
    private readonly content?: unknown,
  ) {}

  public getBinaryResponse(): {
    bytes: Buffer;
    contentType: string;
    inline: boolean;
  } {
    if (
      !this.isBinary() ||
      !this.bytes ||
      !this.contentType ||
      this.inline === undefined
    ) {
      throw new Error('Content result is not binary.');
    }

    return {
      bytes: this.bytes,
      contentType: this.contentType,
      inline: this.inline,
    };
  }

  public getJsonResponse(): unknown {
    return this.content;
  }

  public isBinary(): boolean {
    return this.kind === 'binary';
  }
}
