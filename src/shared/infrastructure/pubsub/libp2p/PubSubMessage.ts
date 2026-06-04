export type PubSubMessage = {
  data?: Uint8Array;
  msg?: {
    data?: Uint8Array;
    topic?: string;
  };
  topic?: string;
};
