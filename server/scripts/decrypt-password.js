import dotenv from "dotenv";
import { decrypt } from "../src/utils/cipher.js";

dotenv.config();

const ciphertext = process.argv[2];
if (!ciphertext) {
  console.error("Usage: node scripts/decrypt-password.js <encrypted-password>");
  process.exit(1);
}

try {
  console.log(decrypt(ciphertext));
} catch (err) {
  console.error("Decrypt failed:", err.message);
  process.exit(1);
}
