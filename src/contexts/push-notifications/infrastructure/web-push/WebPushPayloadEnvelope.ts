import { PushNotificationPayload } from '../../application/send/PushNotificationPayload';

/**
 * Pads every Web Push payload to one fixed size. Encryption already hides the
 * content from the push provider, but the ciphertext length would still reveal
 * the notification type (a short "clear" versus a longer message). A single
 * size removes that signal.
 */
export default class WebPushPayloadEnvelope {
  public static readonly BYTE_LENGTH = 1024;

  /**
   * Returns the padded JSON body, or `undefined` when the payload does not fit
   * the fixed size. Callers must not send an unpadded body in that case.
   */
  public static encode(payload: PushNotificationPayload): string | undefined {
    const unpadded = JSON.stringify({ ...payload, padding: '' });
    const paddingLength =
      WebPushPayloadEnvelope.BYTE_LENGTH - Buffer.byteLength(unpadded);

    if (paddingLength < 0) {
      return undefined;
    }

    return JSON.stringify({ ...payload, padding: 'x'.repeat(paddingLength) });
  }
}
