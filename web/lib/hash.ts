/**
 * Helper script to generate a bcrypt hash for AUTH_PASSWORD_HASH.
 * Run: bun run lib/hash.ts 'your-password'
 */
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("usage: bun run lib/hash.ts <password>");
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 12));
