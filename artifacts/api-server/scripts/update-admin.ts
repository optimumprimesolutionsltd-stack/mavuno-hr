import { hashPassword } from "../src/lib/password.js";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const pw = await hashPassword("OPTIMUMP2026");
  const result = await db
    .update(users)
    .set({ email: "optimumprimesolutionsltd@gmail.com", passwordHash: pw, mustChangePassword: false })
    .where(eq(users.id, 1))
    .returning({ id: users.id, email: users.email });
  console.log("Updated:", JSON.stringify(result));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
