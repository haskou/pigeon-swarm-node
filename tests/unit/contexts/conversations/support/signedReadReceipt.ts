import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

export type SignedReadReceipt = {
  body: { messageId: string };
  method: 'PUT';
  path: string;
  signature: string;
  timestamp: number;
};

/** Builds the proof a reader's client signs for `PUT .../messages/read-until`. */
export async function signedReadReceipt(options: {
  conversationId: string;
  keyPair: KeyPair;
  messageId: string;
  pathPrefix?: string;
  timestamp?: number;
}): Promise<SignedReadReceipt> {
  const path = `${options.pathPrefix ?? ''}/conversations/${encodeURIComponent(options.conversationId)}/messages/read-until`;
  const body = { messageId: options.messageId };
  const timestamp = options.timestamp ?? Date.now();
  const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
    'PUT',
    path,
    timestamp,
    body,
  );

  return {
    body,
    method: 'PUT',
    path,
    signature: options.keyPair.sign(JSON.stringify(payload)).valueOf(),
    timestamp,
  };
}
