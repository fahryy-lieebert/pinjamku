import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

// Secure hanya jika koneksi memang HTTPS (langsung atau lewat proxy),
// supaya login tetap jalan di http://localhost saat development.
export function getSessionCookieOptions(req: Request): CookieOptions {
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: ENV.cookieSecure ?? isHttps,
  };
}
