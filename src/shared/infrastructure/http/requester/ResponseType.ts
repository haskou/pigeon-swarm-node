export const responses = {
  ARRAYBUFFER: 'arraybuffer',
  DOCUMENT: 'document',
  JSON: 'json',
  STREAM: 'stream',
  TEXT: 'text',
} as const;

export type ResponseType = (typeof responses)[keyof typeof responses];
