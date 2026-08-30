/**
 * 24-char hex ids, shaped like the Mongo ObjectIds the frontend used to get.
 * Keeping the shape means zero changes on the React side.
 */
export const newId = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // First 4 bytes are the timestamp, so ids sort roughly by creation time.
  const secs = Math.floor(Date.now() / 1000);
  bytes[0] = (secs >>> 24) & 0xff;
  bytes[1] = (secs >>> 16) & 0xff;
  bytes[2] = (secs >>> 8) & 0xff;
  bytes[3] = secs & 0xff;
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);

export const now = () => new Date().toISOString();
