export type OrbitDBHeadIndexOptions<TDocument extends object> = {
  collectionName: string;
  documentFromRecord(record: Record<string, unknown>): TDocument | undefined;
  documentIds?(document: TDocument): string[];
  recordId(record: Record<string, unknown> | TDocument): string | undefined;
  merge?(current: TDocument, candidate: TDocument): TDocument;
  shouldReplace?(current: TDocument, candidate: TDocument): boolean;
};
