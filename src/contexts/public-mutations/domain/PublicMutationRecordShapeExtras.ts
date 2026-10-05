/** Put-only fields beyond strings and integers. */
export interface PublicMutationRecordShapeExtras {
  booleans?: string[];
  /** Integer, or null, or absent. */
  optionalIntegers?: string[];
  /** Plain JSON objects whose inner shape the policy validates itself. */
  objects?: string[];
  /** Plain JSON object, or null, or absent. */
  optionalObjects?: string[];
  /** String, or absent; a put only. */
  optionalStrings?: string[];
  /** Strings that only a put carries. */
  putStrings?: string[];
  /** Plain JSON arrays whose items the policy validates itself. */
  arrays?: string[];
}
