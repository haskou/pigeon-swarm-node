export interface MongoNodeMetadataDocument {
  _id: 'local';
  networks: Record<
    string,
    {
      id: string;
      key: string | undefined;
      name: string;
    }
  >;
  nodeId: string;
  owner?: string;
}
