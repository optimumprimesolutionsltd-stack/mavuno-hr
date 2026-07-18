/**
 * Seed / bootstrap — run ONCE, from the CLI.
 *
 * The previous design called ensureSeed() at the top of every API request:
 * a table scan and a conditional write in the hot path of every call, forever,
 * for a thing that needs to happen once. Worse, it made the demo data part of
 * the production schema.
 *
 *   npx tsx scripts/seed.ts --statutory-only     # ship the tax packs
 *   npx tsx scripts/seed.ts --org "Acme Ltd" --admin admin@acme.co.ke
 */
import { config } from "dotenv";
config();

import { eq, and, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, users, statutoryConfigs, departments } from "../src/db/schema";
import { ALL_PACKS } from "../src/lib/statutory/packs";
import { hashPassword, generateTempPassword } from "../src/lib/auth/password";

async function seedStatutory() {
  for (const pack of ALL_PACKS) {
    const existing = await db.select().from(statutoryConfigs).where(and(
      eq(statutoryConfigs.countryCode, pack.countryCode),
      eq(statutoryConfigs.effectiveFrom, pack.effectiveFrom),
      isNull(statutoryConfigs.orgId),
    ));
    if (existing.length) { console.log(`  = ${pack.name} (already present)`); continue; }

    await db.insert(statutoryConfigs).values({
      countryCode: pack.countryCode,
      name: pack.name,
      effectiveFrom: pack.effectiveFrom,
      config: pack,
      orgId: null,
    });
    console.log(`  + ${pack.name}`);
  }
}

async function seedOrg(name: string, adminEmail: string, customPassword?: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [existing] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (existing) { console.log(`Organization "${name}" already exists (id ${existing.id})`); return; }

  const [org] = await db.insert(organizations).values({
    name, slug, countryCode: "KE", currencyCode: "KES",
    plan: "trial", seatLimit: 25,
    trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
  }).returning();

  await db.insert(departments).values(
    [["Engineering","ENG"],["Finance","FIN"],["Sales","SLS"],["Operations","OPS"],["People","HRD"]]
      .map(([n, c]) => ({ orgId: org.id, name: n, code: c })),
  );

  const password = customPassword || generateTempPassword();
  const mustChange = !customPassword; // only force rotation for random temp passwords
  await db.insert(users).values({
    orgId: org.id,
    email: adminEmail.toLowerCase(),
    name: "Administrator",
    passwordHash: await hashPassword(password),
    role: "admin",
    mustChangePassword: mustChange,
  });

  console.log(`\nOrganization : ${org.name} (slug: ${org.slug})`);
  console.log(`Admin        : ${adminEmail}`);
  if (customPassword) {
    console.log(`Password     : (the one you specified)`);
  } else {
    console.log(`Temp password: ${password}`);
    console.log(`\nThis password is shown ONCE and must be changed at first login.`);
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const get = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error("SESSION_SECRET must be set to a random string of >= 32 chars before seeding.");
    process.exit(1);
  }

  console.log("Seeding statutory packs…");
  await seedStatutory();

  const org = get("--org");
  const admin = get("--admin");
  const password = get("--password");
  if (org && admin) {
    console.log(`\nCreating organization…`);
    await seedOrg(org, admin, password);
  } else if (!args.includes("--statutory-only")) {
    console.log("\nNo --org/--admin given; skipping org creation.");
    console.log('Usage: npx tsx scripts/seed.ts --org "Acme Ltd" --admin admin@acme.co.ke');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
