/**
 * Most device credentials one identity may hold. A mailbox admits one read
 * capability per device, so this sizes the default reader cap.
 */
export const MAX_DEVICE_CREDENTIALS = 128;

/**
 * Most compromised credentials one recovery checkpoint may carry forward.
 * A recovery that would carry more fails closed.
 */
export const MAX_COMPROMISED_CREDENTIALS = 32;
