export type IPFSClient = {
  addBytesToAll(data: Uint8Array): Promise<{
    valueOf(): string;
  }>;
  addJSONToAll(data: unknown): Promise<{
    valueOf(): string;
  }>;
  getNetworks(): Promise<
    {
      getId(): string;
    }[]
  >;
};
