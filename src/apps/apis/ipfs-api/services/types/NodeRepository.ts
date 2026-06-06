export type NodeRepository = {
  loadLocalNodeId?(): Promise<{
    valueOf(): string;
  }>;
  loadLocalNode(): Promise<{
    toPrimitives(): {
      id: string;
    };
  }>;
};
