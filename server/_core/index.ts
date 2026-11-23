import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { migrate } from "drizzle-orm/mysql2/migrator";
import express from "express";
import { createServer } from "http";
import path from "path";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { ensureAdmin, seedCatalog } from "../seed";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";

// Menjalankan migrasi SQL (folder drizzle/) lalu mengisi data awal.
async function prepareDatabase() {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] DATABASE_URL belum diisi, fitur data tidak akan jalan."
    );
    return;
  }
  if (process.env.AUTO_MIGRATE !== "false") {
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  }
  await ensureAdmin();
  await seedCatalog();
}

async function startServer() {
  ENV.jwtSecret; // gagal cepat bila JWT_SECRET belum diisi di production
  await prepareDatabase();

  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1); // agar cookie Secure benar di belakang proxy HTTPS
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // API tRPC
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  // development memakai Vite, production menyajikan file hasil build
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT tidak valid");
  server.on("error", error => {
    console.error("Server gagal:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server berjalan di port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
