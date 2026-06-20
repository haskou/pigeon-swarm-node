import { CommunityChannelAttachmentId as AttachmentId } from './value-objects/CommunityChannelAttachmentId';

export class CommunityChannelMessageAttachments {
  public static empty(): CommunityChannelMessageAttachments {
    return new CommunityChannelMessageAttachments([]);
  }

  public static from(
    attachments: AttachmentId[],
  ): CommunityChannelMessageAttachments {
    return new CommunityChannelMessageAttachments(attachments);
  }

  private constructor(private readonly attachments: AttachmentId[]) {}

  public [Symbol.iterator](): Iterator<AttachmentId> {
    return this.attachments[Symbol.iterator]();
  }

  public toArray(): AttachmentId[] {
    return [...this.attachments];
  }

  public toPrimitives(): string[] {
    return this.attachments.map((attachment) => attachment.valueOf());
  }
}
