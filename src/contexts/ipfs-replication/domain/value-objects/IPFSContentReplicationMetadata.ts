import { IPFSContentFilename } from './IPFSContentFilename';
import { IPFSContentSize } from './IPFSContentSize';
import { IPFSContentType } from './IPFSContentType';

export class IPFSContentReplicationMetadata {
  public static create(
    sizeBytes: IPFSContentSize,
    contentType: IPFSContentType = IPFSContentType.DEFAULT,
    filename?: IPFSContentFilename,
  ): IPFSContentReplicationMetadata {
    return new IPFSContentReplicationMetadata(sizeBytes, contentType, filename);
  }

  public static fromPrimitives(
    sizeBytes: number,
    contentType?: string,
    filename?: string,
  ): IPFSContentReplicationMetadata {
    return new IPFSContentReplicationMetadata(
      new IPFSContentSize(sizeBytes),
      contentType ? new IPFSContentType(contentType) : IPFSContentType.DEFAULT,
      filename ? new IPFSContentFilename(filename) : undefined,
    );
  }

  constructor(
    private readonly sizeBytes: IPFSContentSize,
    private readonly contentType: IPFSContentType,
    private readonly filename?: IPFSContentFilename,
  ) {}

  public getContentType(): IPFSContentType {
    return this.contentType;
  }

  public getFilename(): IPFSContentFilename | undefined {
    return this.filename;
  }

  public getSizeBytes(): IPFSContentSize {
    return this.sizeBytes;
  }
}
