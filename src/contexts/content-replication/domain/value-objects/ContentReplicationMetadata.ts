import { ContentFilename } from './ContentFilename';
import { ContentSize } from './ContentSize';
import { ContentType } from './ContentType';

export class ContentReplicationMetadata {
  public static create(
    sizeBytes: ContentSize,
    contentType: ContentType = ContentType.DEFAULT,
    filename?: ContentFilename,
  ): ContentReplicationMetadata {
    return new ContentReplicationMetadata(sizeBytes, contentType, filename);
  }

  public static fromPrimitives(
    sizeBytes: number,
    contentType?: string,
    filename?: string,
  ): ContentReplicationMetadata {
    return new ContentReplicationMetadata(
      new ContentSize(sizeBytes),
      contentType ? new ContentType(contentType) : ContentType.DEFAULT,
      filename ? new ContentFilename(filename) : undefined,
    );
  }

  constructor(
    private readonly sizeBytes: ContentSize,
    private readonly contentType: ContentType,
    private readonly filename?: ContentFilename,
  ) {}

  public getContentType(): ContentType {
    return this.contentType;
  }

  public getFilename(): ContentFilename | undefined {
    return this.filename;
  }

  public getSizeBytes(): ContentSize {
    return this.sizeBytes;
  }
}
