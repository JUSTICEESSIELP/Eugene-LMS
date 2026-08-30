/**
 * PBKDF2-SHA256 via WebCrypto. bcryptjs is pure JS and burns far too much
 * Worker CPU per login; PBKDF2 is native here.
 *
 * Stored format: pbkdf2$<iterations>$<saltB64>$<hashB64>
 */
const ITERATIONS = 100_000;
const KEY_LEN = 32;

const b64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const unb64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const derive = async (password: string, salt: Uint8Array) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    KEY_LEN * 8,
  );
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${b64(salt.buffer)}$${b64(bits)}`;
};

export const verifyPassword = async (
  password: string,
  stored: string,
): Promise<boolean> => {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const salt = unb64(parts[2]!);
  const expected = unb64(parts[3]!);
  const bits = new Uint8Array(await derive(password, salt));
  if (bits.length !== expected.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i]! ^ expected[i]!;
  return diff === 0;
};
