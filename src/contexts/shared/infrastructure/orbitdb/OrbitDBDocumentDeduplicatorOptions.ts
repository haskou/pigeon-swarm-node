export type OrbitDBDocumentDeduplicatorOptions<TDocument extends object> = {
  recordId(document: TDocument): string | undefined;
  merge?(current: TDocument, candidate: TDocument): TDocument;
  shouldReplace?(current: TDocument, candidate: TDocument): boolean;
};
