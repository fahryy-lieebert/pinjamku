import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  // Pengenal internal akun: "local:<username>" (akun berpassword) atau "guest:<acak>" (tamu).
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  // Login umum: username + password. Kosong untuk pengguna tamu.
  username: varchar("username", { length: 40 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  categoryId: int("categoryId").notNull(),
  totalQuantity: int("totalQuantity").notNull().default(0),
  availableQuantity: int("availableQuantity").notNull().default(0),
  condition: varchar("condition", { length: 80 }).notNull().default("Baik"),
  location: varchar("location", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const borrowings = mysqlTable("borrowings", {
  id: int("id").autoincrement().primaryKey(),
  ticketNumber: varchar("ticketNumber", { length: 40 }).notNull().unique(),
  itemId: int("itemId").notNull(),
  borrowerName: varchar("borrowerName", { length: 160 }).notNull(),
  borrowerUserId: int("borrowerUserId"),
  quantity: int("quantity").notNull(),
  purpose: text("purpose").notNull(),
  borrowDate: timestamp("borrowDate").defaultNow().notNull(),
  plannedReturnDate: timestamp("plannedReturnDate").notNull(),
  actualReturnDate: timestamp("actualReturnDate"),
  status: mysqlEnum("status", ["Menunggu", "Dipinjam", "Ditolak", "Dikembalikan", "Terlambat"]).default("Menunggu").notNull(),
  decisionNote: text("decisionNote"),
  returnCondition: text("returnCondition"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 160 }).notNull(),
  detail: text("detail"),
  actorName: varchar("actorName", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Item = typeof items.$inferSelect;
export type Borrowing = typeof borrowings.$inferSelect;
