import {
  COOKIE_NAME,
  NOT_ADMIN_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { createSessionToken, hashPassword, verifyPassword } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { appRouter } from "./routers";

function makeUser(role: "user" | "admin"): User {
  return {
    id: 1,
    openId: "local:tes",
    username: "tes",
    passwordHash: null,
    name: "Tes",
    email: null,
    loginMethod: "password",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(user: User | null) {
  const cleared: { name: string; options: Record<string, unknown> }[] = [];
  const ctx = {
    user,
    req: { protocol: "http", headers: {} },
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) =>
        cleared.push({ name, options }),
    },
  } as unknown as TrpcContext;
  return { ctx, cleared };
}

describe("password", () => {
  it("hash tidak sama dengan password dan bisa diverifikasi", async () => {
    const hash = await hashPassword("rahasia123");
    expect(hash).not.toContain("rahasia123");
    expect(await verifyPassword("rahasia123", hash)).toBe(true);
    expect(await verifyPassword("salah", hash)).toBe(false);
  });
  it("hash berbeda tiap kali (salt acak)", async () => {
    expect(await hashPassword("sama")).not.toBe(await hashPassword("sama"));
  });
  it("akun tamu (tanpa hash) tidak bisa login dengan password", async () => {
    expect(await verifyPassword("apa saja", null)).toBe(false);
  });
});

describe("sesi", () => {
  it("token berbentuk JWT", async () => {
    const token = await createSessionToken(7, 60_000);
    expect(token.split(".")).toHaveLength(3);
  });
  it("cookie: httpOnly, lax, Secure hanya jika HTTPS", () => {
    const http = getSessionCookieOptions({
      secure: false,
      headers: {},
    } as never);
    expect(http).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
    const https = getSessionCookieOptions({
      secure: false,
      headers: { "x-forwarded-proto": "https" },
    } as never);
    expect(https.secure).toBe(true);
  });
});

describe("hak akses (tanpa database)", () => {
  it("pengunjung belum login ditolak membaca barang", async () => {
    const { ctx } = makeCtx(null);
    await expect(appRouter.createCaller(ctx).catalog.list()).rejects.toThrow(
      UNAUTHED_ERR_MSG
    );
  });
  it("pengguna biasa tidak boleh menambah barang / menyetujui / buka audit", async () => {
    const { ctx } = makeCtx(makeUser("user"));
    const caller = appRouter.createCaller(ctx);
    const item = {
      code: "X-1",
      name: "Tes",
      category: "Tes",
      totalQuantity: 1,
      condition: "Baik",
      location: "Gudang",
    };
    await expect(caller.catalog.create(item)).rejects.toThrow(
      NOT_ADMIN_ERR_MSG
    );
    await expect(caller.borrowing.approve({ id: 1 })).rejects.toThrow(
      NOT_ADMIN_ERR_MSG
    );
    await expect(
      caller.borrowing.return({ id: 1, condition: "Baik" })
    ).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    await expect(caller.audit.list()).rejects.toThrow(NOT_ADMIN_ERR_MSG);
  });
  it("auth.me tidak membocorkan passwordHash", async () => {
    const user = { ...makeUser("admin"), passwordHash: "scrypt$rahasia" };
    const me = await appRouter.createCaller(makeCtx(user).ctx).auth.me();
    expect(me).not.toHaveProperty("passwordHash");
    expect(me).toMatchObject({ username: "tes", role: "admin" });
  });
  it("validasi: password registrasi terlalu pendek ditolak", async () => {
    const { ctx } = makeCtx(null);
    await expect(
      appRouter
        .createCaller(ctx)
        .auth.register({ name: "Budi", username: "budi_1", password: "123" })
    ).rejects.toThrow(/minimal 8/);
  });
  it("logout menghapus cookie sesi", async () => {
    const { ctx, cleared } = makeCtx(makeUser("user"));
    expect(await appRouter.createCaller(ctx).auth.logout()).toEqual({
      success: true,
    });
    expect(cleared[0]?.name).toBe(COOKIE_NAME);
    expect(cleared[0]?.options).toMatchObject({
      maxAge: -1,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
