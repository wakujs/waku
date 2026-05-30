// Replace control chars with spaces
// https://cwe.mitre.org/data/definitions/117.html
const CONTROL_CHAR = /\p{Cc}/gu;
export const sanitizeLog = (value: unknown): string => {
  const str =
    value instanceof Error ? (value.stack ?? value.message) : String(value);
  return str.replace(CONTROL_CHAR, ' ');
};
