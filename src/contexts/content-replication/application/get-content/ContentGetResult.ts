export type ContentGetResult =
  | {
      bytes: Buffer;
      contentType: string;
      filename?: string;
      kind: 'binary';
    }
  | {
      content: unknown;
      kind: 'json';
    };
