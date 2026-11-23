import { COOKIE_NAME, ONE_DAY_MS, SESSION_DAYS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  auditLogs,
  borrowings,
  categories,
  items,
  users,
  type User,
} from "../drizzle/schema";
import { createSessionToken, hashPassword, verifyPassword } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "./_core/rateLimit";
import { systemRouter } from "./_core/systemRouter";
import type { TrpcContext } from "./_core/context";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { createUser, getDb, getUserByUsername, touchLastSignedIn } from "./db";

// ============================ Helper ============================

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database tidak tersedia. Periksa DATABASE_URL.",
    });
  }
  return db;
}

type Db = Awaited<ReturnType<typeof requireDb>>;
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const actorOf = (user: User) => user.name || user.username || "Admin";

async function writeAudit(
  db: DbOrTx,
  action: string,
  detail: string,
  actorName: string
) {
  await db.insert(auditLogs).values({ action, detail, actorName });
}

function isDuplicateError(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY";
}

// Data akun yang boleh dikirim ke browser (tanpa passwordHash).
function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    loginMethod: user.loginMethod,
  };
}

async function startSession(ctx: TrpcContext, userId: number, days: number) {
  const token = await createSessionToken(userId, days * ONE_DAY_MS);
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: days * ONE_DAY_MS,
  });
}

// Barang yang melewati tanggal kembali otomatis berstatus "Terlambat".
async function markOverdue(db: Db) {
  await db
    .update(borrowings)
    .set({ status: "Terlambat" })
    .where(
      and(
        eq(borrowings.status, "Dipinjam"),
        lt(borrowings.plannedReturnDate, new Date())
      )
    );
}

async function getOrCreateCategoryId(db: DbOrTx, name: string) {
  const found = await db
    .select()
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (found[0]) return found[0].id;
  try {
    const created = await db.insert(categories).values({ name });
    return Number(created[0].insertId);
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
    const again = await db
      .select()
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    return again[0].id;
  }
}

// Tanggal rencana kembali dikirim "YYYY-MM-DD"; dianggap berlaku sampai akhir hari itu.
function parsePlannedReturn(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 23, 59, 59);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date < startOfToday) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tanggal rencana pengembalian tidak boleh sebelum hari ini",
    });
  }
  return date;
}

function newTicketNumber() {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `PJ-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

// ============================ Validasi input ============================

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_.]{3,30}$/,
    "Username 3-30 karakter: huruf, angka, titik, atau garis bawah"
  );
const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(100, "Password terlalu panjang");
const nameSchema = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter")
  .max(80, "Nama maksimal 80 karakter");

const itemInput = z.object({
  code: z.string().trim().min(2, "Kode barang minimal 2 karakter").max(40),
  name: z.string().trim().min(2, "Nama barang minimal 2 karakter").max(160),
  category: z.string().trim().min(2, "Kategori minimal 2 karakter").max(120),
  totalQuantity: z
    .number()
    .int("Jumlah harus bilangan bulat")
    .min(1, "Jumlah minimal 1"),
  condition: z.string().trim().min(2, "Kondisi wajib diisi").max(80),
  location: z.string().trim().min(2, "Lokasi wajib diisi").max(160),
});

// ============================ Router ============================

export const appRouter = router({
  system: systemRouter,

  // ---------- Login umum: username + password, daftar akun, atau tamu ----------
  auth: router({
    me: publicProcedure.query(({ ctx }) =>
      ctx.user ? toPublicUser(ctx.user) : null
    ),

    login: publicProcedure
      .input(
        z.object({
          username: z
            .string()
            .trim()
            .toLowerCase()
            .min(1, "Username wajib diisi"),
          password: z.string().min(1, "Password wajib diisi"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const key = `${ctx.req.ip}:${input.username}`;
        try {
          assertLoginAllowed(key);
        } catch (error) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: (error as Error).message,
          });
        }
        const user = await getUserByUsername(input.username);
        const valid = user
          ? await verifyPassword(input.password, user.passwordHash)
          : false;
        if (!user || !valid) {
          recordLoginFailure(key);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Username atau password salah",
          });
        }
        clearLoginFailures(key);
        await touchLastSignedIn(user.id);
        await startSession(ctx, user.id, SESSION_DAYS);
        return toPublicUser(user);
      }),

    // Daftar akun baru: selalu berperan "user". Admin hanya dibuat lewat seed/DB.
    register: publicProcedure
      .input(
        z.object({
          name: nameSchema,
          username: usernameSchema,
          password: passwordSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (await getUserByUsername(input.username)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Username sudah dipakai",
          });
        }
        let id: number;
        try {
          id = await createUser({
            openId: `local:${input.username}`,
            username: input.username,
            passwordHash: await hashPassword(input.password),
            name: input.name,
            loginMethod: "password",
            role: "user",
          });
        } catch (error) {
          if (isDuplicateError(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Username sudah dipakai",
            });
          }
          throw error;
        }
        await startSession(ctx, id, SESSION_DAYS);
        return {
          id,
          name: input.name,
          username: input.username,
          role: "user" as const,
          loginMethod: "password",
        };
      }),

    // Masuk cepat tanpa akun: cukup nama (sesuai konsep "pengguna cukup menulis nama").
    guest: publicProcedure
      .input(z.object({ name: nameSchema }))
      .mutation(async ({ input, ctx }) => {
        const id = await createUser({
          openId: `guest:${randomBytes(8).toString("hex")}`,
          name: input.name,
          loginMethod: "guest",
          role: "user",
        });
        await startSession(ctx, id, 1);
        return {
          id,
          name: input.name,
          username: null,
          role: "user" as const,
          loginMethod: "guest",
        };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),

    changePassword: protectedProcedure
      .input(
        z.object({
          oldPassword: z.string().min(1, "Password lama wajib diisi"),
          newPassword: passwordSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!(await verifyPassword(input.oldPassword, ctx.user.passwordHash))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Password lama salah",
          });
        }
        const db = await requireDb();
        await db
          .update(users)
          .set({ passwordHash: await hashPassword(input.newPassword) })
          .where(eq(users.id, ctx.user.id));
        return { success: true } as const;
      }),
  }),

  // ---------- Data barang ----------
  catalog: router({
    list: protectedProcedure.query(async () => {
      const db = await requireDb();
      return db
        .select({ item: items, category: categories.name })
        .from(items)
        .leftJoin(categories, eq(items.categoryId, categories.id))
        .orderBy(desc(items.createdAt));
    }),

    categories: protectedProcedure.query(async () => {
      const db = await requireDb();
      return db.select().from(categories).orderBy(categories.name);
    }),

    create: adminProcedure.input(itemInput).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      try {
        return await db.transaction(async tx => {
          const categoryId = await getOrCreateCategoryId(tx, input.category);
          const result = await tx.insert(items).values({
            code: input.code,
            name: input.name,
            categoryId,
            totalQuantity: input.totalQuantity,
            availableQuantity: input.totalQuantity,
            condition: input.condition,
            location: input.location,
          });
          await writeAudit(
            tx,
            "Barang ditambahkan",
            `${input.code} - ${input.name}`,
            actorOf(ctx.user)
          );
          return { id: Number(result[0].insertId) };
        });
      } catch (error) {
        if (isDuplicateError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Kode barang "${input.code}" sudah dipakai`,
          });
        }
        throw error;
      }
    }),

    update: adminProcedure
      .input(z.object({ id: z.number().int(), data: itemInput }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        try {
          return await db.transaction(async tx => {
            const [row] = await tx
              .select()
              .from(items)
              .where(eq(items.id, input.id))
              .for("update");
            if (!row)
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Barang tidak ditemukan",
              });
            const borrowed = row.totalQuantity - row.availableQuantity;
            if (input.data.totalQuantity < borrowed) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Jumlah total tidak boleh kurang dari ${borrowed} (sedang dipinjam)`,
              });
            }
            const { category, ...fields } = input.data;
            const categoryId = await getOrCreateCategoryId(tx, category);
            await tx
              .update(items)
              .set({
                ...fields,
                categoryId,
                availableQuantity: fields.totalQuantity - borrowed,
              })
              .where(eq(items.id, input.id));
            await writeAudit(
              tx,
              "Barang diperbarui",
              `${fields.code} - ${fields.name}`,
              actorOf(ctx.user)
            );
            return { success: true } as const;
          });
        } catch (error) {
          if (isDuplicateError(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Kode barang "${input.data.code}" sudah dipakai`,
            });
          }
          throw error;
        }
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        return db.transaction(async tx => {
          const [row] = await tx
            .select()
            .from(items)
            .where(eq(items.id, input.id))
            .for("update");
          if (!row)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Barang tidak ditemukan",
            });
          const active = await tx
            .select({ id: borrowings.id })
            .from(borrowings)
            .where(
              and(
                eq(borrowings.itemId, input.id),
                inArray(borrowings.status, [
                  "Menunggu",
                  "Dipinjam",
                  "Terlambat",
                ])
              )
            )
            .limit(1);
          if (active.length) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Barang masih memiliki transaksi aktif",
            });
          }
          await tx.delete(items).where(eq(items.id, input.id));
          await writeAudit(
            tx,
            "Barang dihapus",
            `${row.code} - ${row.name}`,
            actorOf(ctx.user)
          );
          return { success: true } as const;
        });
      }),
  }),

  // ---------- Peminjaman & pengembalian ----------
  borrowing: router({
    // Admin melihat semua transaksi; pengguna hanya melihat miliknya sendiri.
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      await markOverdue(db);
      const query = db
        .select({ borrowing: borrowings, itemName: items.name })
        .from(borrowings)
        .leftJoin(items, eq(borrowings.itemId, items.id));
      const rows =
        ctx.user.role === "admin"
          ? await query.orderBy(desc(borrowings.createdAt))
          : await query
              .where(eq(borrowings.borrowerUserId, ctx.user.id))
              .orderBy(desc(borrowings.createdAt));
      return rows.map(row => ({
        ...row,
        itemName: row.itemName ?? "(barang sudah dihapus)",
      }));
    }),

    create: protectedProcedure
      .input(
        z.object({
          itemId: z.number().int(),
          quantity: z
            .number()
            .int("Jumlah harus bilangan bulat")
            .min(1, "Jumlah minimal 1"),
          purpose: z
            .string()
            .trim()
            .min(3, "Keperluan minimal 3 karakter")
            .max(500),
          plannedReturnDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const plannedReturnDate = parsePlannedReturn(input.plannedReturnDate);
        const [item] = await db
          .select()
          .from(items)
          .where(eq(items.id, input.itemId))
          .limit(1);
        if (!item)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Barang tidak ditemukan",
          });
        if (input.quantity > item.availableQuantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Stok tidak cukup. Tersedia ${item.availableQuantity} unit`,
          });
        }
        const ticket = newTicketNumber();
        const borrowerName = actorOf(ctx.user);
        const result = await db.insert(borrowings).values({
          ticketNumber: ticket,
          itemId: input.itemId,
          borrowerName,
          borrowerUserId: ctx.user.id,
          quantity: input.quantity,
          purpose: input.purpose,
          plannedReturnDate,
          status: "Menunggu",
        });
        await writeAudit(
          db,
          "Pengajuan dibuat",
          `${ticket} - ${item.name} x${input.quantity}`,
          borrowerName
        );
        return { id: Number(result[0].insertId), ticket };
      }),

    // Setujui: stok dikurangi secara atomik; hanya pengajuan berstatus Menunggu.
    approve: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        return db.transaction(async tx => {
          const [row] = await tx
            .select()
            .from(borrowings)
            .where(eq(borrowings.id, input.id))
            .for("update");
          if (!row)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Pengajuan tidak ditemukan",
            });
          if (row.status !== "Menunggu") {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Pengajuan sudah diproses (status: ${row.status})`,
            });
          }
          const [update] = await tx
            .update(items)
            .set({
              availableQuantity: sql`${items.availableQuantity} - ${row.quantity}`,
            })
            .where(
              and(
                eq(items.id, row.itemId),
                gte(items.availableQuantity, row.quantity)
              )
            );
          if (update.affectedRows === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Stok tidak mencukupi atau barang sudah dihapus",
            });
          }
          await tx
            .update(borrowings)
            .set({ status: "Dipinjam", borrowDate: new Date() })
            .where(eq(borrowings.id, row.id));
          await writeAudit(
            tx,
            "Peminjaman disetujui",
            row.ticketNumber,
            actorOf(ctx.user)
          );
          return { success: true } as const;
        });
      }),

    reject: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          note: z
            .string()
            .trim()
            .min(2, "Alasan penolakan wajib diisi")
            .max(500),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        return db.transaction(async tx => {
          const [row] = await tx
            .select()
            .from(borrowings)
            .where(eq(borrowings.id, input.id))
            .for("update");
          if (!row)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Pengajuan tidak ditemukan",
            });
          if (row.status !== "Menunggu") {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Pengajuan sudah diproses (status: ${row.status})`,
            });
          }
          await tx
            .update(borrowings)
            .set({ status: "Ditolak", decisionNote: input.note })
            .where(eq(borrowings.id, row.id));
          await writeAudit(
            tx,
            "Peminjaman ditolak",
            `${row.ticketNumber} - ${input.note}`,
            actorOf(ctx.user)
          );
          return { success: true } as const;
        });
      }),

    // Pengembalian: hanya untuk barang yang sedang Dipinjam/Terlambat; stok bertambah.
    return: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          condition: z
            .string()
            .trim()
            .min(2, "Kondisi barang wajib diisi")
            .max(300),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        return db.transaction(async tx => {
          const [row] = await tx
            .select()
            .from(borrowings)
            .where(eq(borrowings.id, input.id))
            .for("update");
          if (!row)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Transaksi tidak ditemukan",
            });
          if (row.status !== "Dipinjam" && row.status !== "Terlambat") {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Barang tidak sedang dipinjam (status: ${row.status})`,
            });
          }
          await tx
            .update(borrowings)
            .set({
              status: "Dikembalikan",
              actualReturnDate: new Date(),
              returnCondition: input.condition,
            })
            .where(eq(borrowings.id, row.id));
          await tx
            .update(items)
            .set({
              availableQuantity: sql`LEAST(${items.totalQuantity}, ${items.availableQuantity} + ${row.quantity})`,
            })
            .where(eq(items.id, row.itemId));
          await writeAudit(
            tx,
            "Barang dikembalikan",
            `${row.ticketNumber} - ${input.condition}`,
            actorOf(ctx.user)
          );
          return { success: true } as const;
        });
      }),
  }),

  // ---------- Audit log (khusus admin) ----------
  audit: router({
    list: adminProcedure.query(async () => {
      const db = await requireDb();
      return db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(50);
    }),
  }),
});

export type AppRouter = typeof appRouter;
