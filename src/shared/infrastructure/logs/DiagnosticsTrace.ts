/**
 * Receives already-redacted diagnostic lines while the node owner has a
 * consented diagnostics session open. Diagnostic lines never go to the log.
 */
export type DiagnosticsTrace = {
  isRecording(): Promise<boolean>;
  record(line: string): Promise<void>;
};
