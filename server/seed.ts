import { eq, sql } from "drizzle-orm";
import { categories, items, users } from "../drizzle/schema";
import { hashPassword } from "./_core/auth";
import { ENV } from "./_core/env";
import { getDb } from "./db";

// Membuat akun administrator pertama jika belum ada admin sama sekali.
export async function ensureAdmin() {
  const db = await getDb();
  if (!db) return;
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (admins.length) return;

  await db.insert(users).values({
    openId: `local:${ENV.adminUsername}`,
    username: ENV.adminUsername,
    passwordHash: await hashPassword(ENV.adminPassword),
    name: ENV.adminName,
    loginMethod: "password",
    role: "admin",
  });
  console.log(
    `[Seed] Akun administrator dibuat: username "${ENV.adminUsername}"`
  );
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      '[Seed] ADMIN_PASSWORD belum diisi, memakai password bawaan "admin123". Ganti setelah login!'
    );
  }
}

// Data contoh barang, hanya dibuat saat tabel barang masih kosong.
export async function seedCatalog() {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(items);
  if (Number(existing[0]?.count ?? 0) > 0) return;

  for (const name of ["Elektronik", "Dokumentasi", "Acara"]) {
    await db
      .insert(categories)
      .values({ name })
      .onDuplicateKeyUpdate({ set: { name } });
  }
  const cats = await db.select().from(categories);
  const categoryId = (name: string) =>
    cats.find(category => category.name === name)?.id ?? cats[0].id;

  await db.insert(items).values([
    {
      code: "BRG-001",
      name: "Proyektor Epson",
      categoryId: categoryId("Elektronik"),
      totalQuantity: 4,
      availableQuantity: 4,
      condition: "Baik",
      location: "Ruang Logistik",
    },
    {
      code: "BRG-002",
      name: "Laptop Lenovo",
      categoryId: categoryId("Elektronik"),
      totalQuantity: 8,
      availableQuantity: 8,
      condition: "Sangat baik",
      location: "Ruang Logistik",
    },
    {
      code: "BRG-003",
      name: "Kamera Canon",
      categoryId: categoryId("Dokumentasi"),
      totalQuantity: 2,
      availableQuantity: 2,
      condition: "Baik",
      location: "Ruang Media",
    },
    {
      code: "BRG-004",
      name: "Speaker Portable",
      categoryId: categoryId("Acara"),
      totalQuantity: 3,
      availableQuantity: 3,
      condition: "Baik",
      location: "Ruang Logistik",
    },
  ]);
}
