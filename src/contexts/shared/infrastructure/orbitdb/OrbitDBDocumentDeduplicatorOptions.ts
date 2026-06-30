export type OrbitDBDocumentDeduplicatorOptions<TDocument extends object> = {
  recordId(document: TDocument): string | undefined;
  shouldReplace?(current: TDocument, candidate: TDocument): boolean;
};
