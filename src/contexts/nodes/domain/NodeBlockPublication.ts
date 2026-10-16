/**
 * Whether this node serves its owner's block list to other nodes. Off by
 * default: publishing is an explicit owner choice.
 */
export class NodeBlockPublication {
  public static unpublished(): NodeBlockPublication {
    return new NodeBlockPublication(false);
  }

  constructor(private readonly published: boolean) {}

  public isPublished(): boolean {
    return this.published;
  }

  public toPrimitives(): { published: boolean } {
    return { published: this.published };
  }
}
