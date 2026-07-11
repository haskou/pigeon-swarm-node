declare module '@cucumber/cucumber/lib/runtime/attachment_manager' {
  import { Readable } from 'stream';

  export type ICreateAttachment = (
    data: Buffer | Readable | string,
    mediaType?: string,
    callback?: () => void,
  ) => void | Promise<void>;

  export type ICreateLog = (text: string) => void | Promise<void>;
}
