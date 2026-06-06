export type IPFSContentResponse =
  | {
      bytes: Buffer;
      kind: 'binary';
    }
  | {
      content: unknown;
      kind: 'json';
    };
