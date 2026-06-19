import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const CIPHER_CODE = "WARSI";
const KEY = crypto.createHash("sha256").update(CIPHER_CODE).digest();

/** Encrypt plaintext using AES-256-CBC with key derived from WARSI. */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(String(plaintext), "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/** Decrypt ciphertext produced by encrypt(). */
export function decrypt(ciphertext) {
  const [ivHex, encrypted] = String(ciphertext).split(":");
  if (!ivHex || !encrypted) return null;
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function verifyPassword(plaintext, stored) {
  try {
    return decrypt(stored) === plaintext;
  } catch {
    return false;
  }
}
