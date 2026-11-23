import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  // Dipakai frontend untuk menampilkan status koneksi database yang sebenarnya.
  health: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return { ok: true, database: false };
      await db.execute(sql`select 1`);
      return { ok: true, database: true };
    } catch {
      return { ok: true, database: false };
    }
  }),
});
