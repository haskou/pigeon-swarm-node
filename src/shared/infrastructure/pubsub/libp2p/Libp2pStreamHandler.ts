import { Libp2pStream } from './Libp2pStream';

export type Libp2pStreamHandler = (
  stream: Libp2pStream,
  connection?: { remotePeer?: { toString(): string } },
) => void | Promise<void>;
