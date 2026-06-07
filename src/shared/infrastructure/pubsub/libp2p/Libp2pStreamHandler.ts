import { Libp2pStream } from './Libp2pStream';

export type Libp2pStreamHandler = (event: {
  connection?: { remotePeer?: { toString(): string } };
  stream: Libp2pStream;
}) => void | Promise<void>;
