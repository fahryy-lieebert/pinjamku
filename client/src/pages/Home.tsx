import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Check,
  ClipboardList,
  Download,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import Login from "./Login";

type Page = "dashboard" | "items" | "loans" | "reports";
type Out = inferRouterOutputs<AppRouter>;
type CurrentUser = NonNullable<Out["auth"]["me"]>;

const PAGE_TITLE: Record<Page, string> = {
  dashboard: "Ringkasan",
  items: "Data Barang",
  loans: "Peminjaman",
  reports: "Laporan",
};

const formatDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString("id-ID") : "-";

const roleLabel = (user: CurrentUser) =>
  user.role === "admin"
    ? "Administrator"
    : user.loginMethod === "guest"
      ? "Tamu"
      : "Pengguna";

function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
  );
}

// =============================== Halaman utama ===============================

export default function Home() {
  const auth = trpc.auth.me.useQuery();
  const [page, setPage] = useState<Page>("dashboard");

  if (auth.isLoading) return <div className="loading">Memuat sistem...</div>;
  if (!auth.data) return <Login />;

  const user = auth.data;
  const isAdmin = user.role === "admin";
  // Pengguna biasa tidak punya akses ke Laporan, jadi jatuh ke Ringkasan.
  const current: Page = page === "reports" && !isAdmin ? "dashboard" : page;

  return (
    <Layout page={current} setPage={setPage} user={user}>
      {current === "dashboard" && <Dashboard user={user} setPage={setPage} />}
      {current === "items" && <Items user={user} />}
      {current === "loans" && <Loans user={user} />}
      {current === "reports" && isAdmin && <Reports />}
    </Layout>
  );
}

// =============================== Kerangka & menu ===============================

function Layout({
  page,
  setPage,
  user,
  children,
}: {
  page: Page;
  setPage: (page: Page) => void;
  user: CurrentUser;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const health = trpc.system.health.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Tandai belum login (layar pindah ke halaman login) dan buang cache
      // data lain supaya pengguna berikutnya tidak melihat data sebelumnya.
      utils.auth.me.setData(undefined, null);
      queryClient.removeQueries({
        predicate: query => {
          const [path] = query.queryKey as [string[]];
          return path.join(".") !== "auth.me";
        },
      });
    },
  });
  const [changing, setChanging] = useState(false);
  const pages: Page[] =
    user.role === "admin"
      ? ["dashboard", "items", "loans", "reports"]
      : ["dashboard", "items", "loans"];
  const dbOnline = health.data?.database !== false;

  return (
    <div className="simple-app">
      <aside className="simple-side">
        <div className="simple-logo">
          <b>P</b> PinjamKu
        </div>
        <div className="simple-workspace">
          Sistem Informasi
          <br />
          <small>Data tersimpan di database</small>
        </div>
        <nav>
          {pages.map(item => (
            <button
              key={item}
              className={page === item ? "active" : ""}
              onClick={() => setPage(item)}
            >
              {PAGE_TITLE[item]}
            </button>
          ))}
        </nav>
        <div className="simple-account">
          <strong>{user.name || user.username}</strong>
          <small>{roleLabel(user)}</small>
          <div className="row">
            {user.loginMethod === "password" && (
              <button onClick={() => setChanging(true)}>Ganti password</button>
            )}
            <button onClick={() => logout.mutate()}>Keluar</button>
          </div>
        </div>
      </aside>
      <main className="simple-main">
        <header className="simple-top">
          <span>PinjamKu / {PAGE_TITLE[page]}</span>
          <span className={`db-status ${dbOnline ? "" : "off"}`}>
            ● {dbOnline ? "Database terhubung" : "Database tidak terhubung"}
          </span>
        </header>
        {children}
      </main>
      {changing && <PasswordForm onClose={() => setChanging(false)} />}
    </div>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "" });
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password berhasil diganti");
      onClose();
    },
  });
  return (
    <div className="overlay">
      <form
        className="form-card"
        onSubmit={event => {
          event.preventDefault();
          change.mutate(form);
        }}
      >
        <div className="panel-title">
          <h3>Ganti password</h3>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <label>
          Password lama
          <input
            type="password"
            required
            autoComplete="current-password"
            value={form.oldPassword}
            onChange={event =>
              setForm({ ...form, oldPassword: event.target.value })
            }
          />
        </label>
        <label>
          Password baru (minimal 8 karakter)
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={event =>
              setForm({ ...form, newPassword: event.target.value })
            }
          />
        </label>
        <button className="primary-button" disabled={change.isPending}>
          Simpan
        </button>
      </form>
    </div>
  );
}

// =============================== Ringkasan ===============================

function Dashboard({
  user,
  setPage,
}: {
  user: CurrentUser;
  setPage: (page: Page) => void;
}) {
  const items = trpc.catalog.list.useQuery();
  const loans = trpc.borrowing.list.useQuery();
  const itemRows = items.data ?? [];
  const loanRows = loans.data ?? [];
  const isAdmin = user.role === "admin";

  const total = itemRows.reduce((sum, row) => sum + row.item.totalQuantity, 0);
  const available = itemRows.reduce(
    (sum, row) => sum + row.item.availableQuantity,
    0
  );
  const pending = loanRows.filter(
    row => row.borrowing.status === "Menunggu"
  ).length;
  const active = loanRows.filter(row =>
    ["Dipinjam", "Terlambat"].includes(row.borrowing.status)
  ).length;

  return (
    <div className="simple-content">
      <div className="simple-heading">
        <div>
          <span className="eyebrow">{isAdmin ? "Admin" : "Pengguna"}</span>
          <h2>Ringkasan</h2>
        </div>
        <span className="muted">Data langsung dari database</span>
      </div>
      <section className="simple-hero">
        <span className="eyebrow">Sistem informasi peminjaman barang</span>
        <h1>
          {isAdmin
            ? "Kelola barang dan transaksi"
            : `Halo, ${user.name || user.username}`}
        </h1>
        <p>
          {isAdmin
            ? "Setujui pengajuan, catat pengembalian, dan pantau stok dari menu di samping."
            : "Pilih barang yang tersedia lalu ajukan peminjaman dari menu Peminjaman."}
        </p>
      </section>
      <div className="simple-stats">
        <div>
          <small>Total barang</small>
          <strong>{total}</strong>
        </div>
        <div>
          <small>Barang tersedia</small>
          <strong>{available}</strong>
        </div>
        <div>
          <small>{isAdmin ? "Transaksi aktif" : "Pinjaman aktif Anda"}</small>
          <strong>{active}</strong>
        </div>
        <div>
          <small>Menunggu</small>
          <strong>{pending}</strong>
        </div>
      </div>
      <div className="simple-columns">
        <section className="simple-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">Transaksi</span>
              <h3>Transaksi terbaru</h3>
            </div>
            <button onClick={() => setPage("loans")}>Lihat semua</button>
          </div>
          {loanRows.length === 0 && (
            <div className="empty">Belum ada transaksi.</div>
          )}
          {loanRows.slice(0, 5).map(row => (
            <div className="loan-line" key={row.borrowing.id}>
              <div>
                <strong>{row.itemName}</strong>
                <small>
                  {row.borrowing.borrowerName} · {row.borrowing.ticketNumber}
                </small>
              </div>
              <Badge status={row.borrowing.status} />
            </div>
          ))}
        </section>
        <section className="simple-panel">
          <span className="eyebrow">Aksi cepat</span>
          <h3>Menu utama</h3>
          <button className="action-button" onClick={() => setPage("items")}>
            <Boxes size={16} /> Lihat data barang
          </button>
          <button className="action-button" onClick={() => setPage("loans")}>
            <ClipboardList size={16} />{" "}
            {isAdmin ? "Kelola peminjaman" : "Ajukan peminjaman"}
          </button>
          {isAdmin && (
            <button
              className="action-button"
              onClick={() => setPage("reports")}
            >
              <PackageCheck size={16} /> Buka laporan
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

// =============================== Data barang ===============================

type ItemRow = Out["catalog"]["list"][number];

function Items({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const isAdmin = user.role === "admin";
  const [search, setSearch] = useState("");
  // null = form tertutup, "new" = tambah barang, objek = edit barang
  const [editing, setEditing] = useState<ItemRow | "new" | null>(null);
  const data = trpc.catalog.list.useQuery();
  const refresh = () => queryClient.invalidateQueries();

  const create = trpc.catalog.create.useMutation({
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success("Barang ditambahkan");
    },
  });
  const update = trpc.catalog.update.useMutation({
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success("Barang diperbarui");
    },
  });
  const remove = trpc.catalog.remove.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Barang dihapus");
    },
  });

  const rows = (data.data ?? []).filter(row =>
    `${row.item.code} ${row.item.name} ${row.category ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="simple-content">
      <div className="simple-heading">
        <div>
          <span className="eyebrow">Master data</span>
          <h2>Data Barang</h2>
        </div>
        {isAdmin && (
          <button
            className="primary-button small"
            onClick={() => setEditing("new")}
          >
            <Plus size={15} /> Tambah barang
          </button>
        )}
      </div>
      <div className="simple-toolbar">
        <Search size={16} />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Cari kode, nama, atau kategori"
        />
      </div>
      <div className="simple-table">
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Barang</th>
              <th>Kategori</th>
              <th>Lokasi</th>
              <th>Stok</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.item.id}>
                <td>{row.item.code}</td>
                <td>
                  <strong>{row.item.name}</strong>
                  <small>{row.item.condition}</small>
                </td>
                <td>{row.category}</td>
                <td>{row.item.location}</td>
                <td>
                  {row.item.availableQuantity} / {row.item.totalQuantity}
                </td>
                <td>
                  <Badge
                    status={
                      row.item.availableQuantity > 0 ? "Tersedia" : "Habis"
                    }
                  />
                </td>
                <td>
                  {isAdmin && (
                    <>
                      <button
                        className="icon-button"
                        title="Ubah"
                        onClick={() => setEditing(row)}
                      >
                        <Pencil size={14} />
                      </button>{" "}
                      <button
                        className="icon-button"
                        title="Hapus"
                        onClick={() => {
                          if (confirm(`Hapus ${row.item.name}?`))
                            remove.mutate({ id: row.item.id });
                        }}
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty">Tidak ada barang yang cocok.</div>
        )}
      </div>
      {editing && (
        <ItemForm
          initial={editing === "new" ? null : editing}
          saving={create.isPending || update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={value =>
            editing === "new"
              ? create.mutate(value)
              : update.mutate({ id: editing.item.id, data: value })
          }
        />
      )}
    </div>
  );
}

function ItemForm({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial: ItemRow | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (value: {
    code: string;
    name: string;
    category: string;
    totalQuantity: number;
    condition: string;
    location: string;
  }) => void;
}) {
  const categories = trpc.catalog.categories.useQuery();
  const [form, setForm] = useState({
    code: initial?.item.code ?? "",
    name: initial?.item.name ?? "",
    category: initial?.category ?? "Elektronik",
    totalQuantity: initial?.item.totalQuantity ?? 1,
    condition: initial?.item.condition ?? "Baik",
    location: initial?.item.location ?? "",
  });
  const set = (key: string, value: string | number) =>
    setForm(current => ({ ...current, [key]: value }));
  const text = {
    code: "Kode barang",
    name: "Nama barang",
    location: "Lokasi",
  } as const;

  return (
    <div className="overlay">
      <form
        className="form-card"
        onSubmit={event => {
          event.preventDefault();
          onSubmit({ ...form, totalQuantity: Number(form.totalQuantity) });
        }}
      >
        <div className="panel-title">
          <h3>{initial ? "Ubah barang" : "Tambah barang"}</h3>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        {(Object.keys(text) as (keyof typeof text)[]).map(key => (
          <label key={key}>
            {text[key]}
            <input
              required
              value={form[key]}
              onChange={event => set(key, event.target.value)}
            />
          </label>
        ))}
        <label>
          Kategori (pilih atau ketik baru)
          <input
            required
            list="category-list"
            value={form.category}
            onChange={event => set("category", event.target.value)}
          />
          <datalist id="category-list">
            {(categories.data ?? []).map(category => (
              <option key={category.id} value={category.name} />
            ))}
          </datalist>
        </label>
        <label>
          Jumlah total
          <input
            required
            min={1}
            type="number"
            value={form.totalQuantity}
            onChange={event => set("totalQuantity", event.target.value)}
          />
        </label>
        <label>
          Kondisi
          <input
            required
            value={form.condition}
            onChange={event => set("condition", event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={saving}>
          Simpan
        </button>
      </form>
    </div>
  );
}

// =============================== Peminjaman ===============================

function Loans({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const isAdmin = user.role === "admin";
  const [open, setOpen] = useState(false);
  const items = trpc.catalog.list.useQuery();
  const loans = trpc.borrowing.list.useQuery();
  const refresh = () => queryClient.invalidateQueries();

  const approve = trpc.borrowing.approve.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Pengajuan disetujui");
    },
  });
  const reject = trpc.borrowing.reject.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Pengajuan ditolak");
    },
  });
  const returnItem = trpc.borrowing.return.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Pengembalian dicatat");
    },
  });
  const create = trpc.borrowing.create.useMutation({
    onSuccess: result => {
      setOpen(false);
      refresh();
      toast.success(`Pengajuan terkirim (${result.ticket})`);
    },
  });
  const rows = loans.data ?? [];

  return (
    <div className="simple-content">
      <div className="simple-heading">
        <div>
          <span className="eyebrow">Transaksi</span>
          <h2>Peminjaman</h2>
        </div>
        {!isAdmin && (
          <button
            className="primary-button small"
            onClick={() => setOpen(true)}
          >
            <Plus size={15} /> Ajukan baru
          </button>
        )}
      </div>
      <div className="simple-table">
        <table>
          <thead>
            <tr>
              <th>Nomor</th>
              <th>Barang</th>
              <th>Peminjam</th>
              <th>Keperluan</th>
              <th>Rencana kembali</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ borrowing: x, itemName }) => (
              <tr key={x.id}>
                <td>
                  {x.ticketNumber}
                  <small>{formatDate(x.createdAt)}</small>
                </td>
                <td>
                  <strong>{itemName}</strong>
                  <small>{x.quantity} unit</small>
                </td>
                <td>{x.borrowerName}</td>
                <td>
                  {x.purpose}
                  {x.decisionNote && (
                    <small>Alasan ditolak: {x.decisionNote}</small>
                  )}
                  {x.returnCondition && (
                    <small>Kondisi kembali: {x.returnCondition}</small>
                  )}
                </td>
                <td>
                  {formatDate(x.plannedReturnDate)}
                  {x.actualReturnDate && (
                    <small>Kembali: {formatDate(x.actualReturnDate)}</small>
                  )}
                </td>
                <td>
                  <Badge status={x.status} />
                </td>
                <td>
                  {isAdmin && x.status === "Menunggu" && (
                    <>
                      <button
                        className="mini ok"
                        title="Setujui"
                        onClick={() => approve.mutate({ id: x.id })}
                      >
                        <Check size={14} />
                      </button>{" "}
                      <button
                        className="mini danger"
                        title="Tolak"
                        onClick={() => {
                          const note = prompt("Alasan penolakan:");
                          if (note) reject.mutate({ id: x.id, note });
                        }}
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                  {isAdmin && ["Dipinjam", "Terlambat"].includes(x.status) && (
                    <button
                      className="mini"
                      onClick={() => {
                        const condition = prompt(
                          "Kondisi barang saat kembali:",
                          "Baik dan lengkap"
                        );
                        if (condition)
                          returnItem.mutate({ id: x.id, condition });
                      }}
                    >
                      Kembali
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Belum ada transaksi.</div>}
      </div>
      {open && (
        <BorrowForm
          items={(items.data ?? []).filter(x => x.item.availableQuantity > 0)}
          borrowerName={user.name || user.username || ""}
          saving={create.isPending}
          onClose={() => setOpen(false)}
          onSubmit={value => create.mutate(value)}
        />
      )}
    </div>
  );
}

// Format YYYY-MM-DD untuk <input type="date">, dengan selisih hari dari hari ini.
const isoDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function BorrowForm({
  items,
  borrowerName,
  saving,
  onClose,
  onSubmit,
}: {
  items: ItemRow[];
  borrowerName: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (value: {
    itemId: number;
    quantity: number;
    purpose: string;
    plannedReturnDate: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    itemId: items[0]?.item.id ?? 0,
    quantity: 1,
    purpose: "",
    plannedReturnDate: isoDate(1),
  });
  const selected = items.find(x => x.item.id === form.itemId);

  return (
    <div className="overlay">
      <form
        className="form-card"
        onSubmit={event => {
          event.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="panel-title">
          <h3>Ajukan peminjaman</h3>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        {items.length === 0 ? (
          <div className="empty">Saat ini tidak ada barang yang tersedia.</div>
        ) : (
          <>
            <label>
              Nama peminjam
              <input value={borrowerName} readOnly />
            </label>
            <label>
              Barang
              <select
                value={form.itemId}
                onChange={event =>
                  setForm({
                    ...form,
                    itemId: Number(event.target.value),
                    quantity: 1,
                  })
                }
              >
                {items.map(x => (
                  <option key={x.item.id} value={x.item.id}>
                    {x.item.name} — {x.item.availableQuantity} tersedia
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jumlah
              <input
                required
                min={1}
                max={selected?.item.availableQuantity}
                type="number"
                value={form.quantity}
                onChange={event =>
                  setForm({ ...form, quantity: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Rencana kembali
              <input
                required
                type="date"
                min={isoDate(0)}
                value={form.plannedReturnDate}
                onChange={event =>
                  setForm({ ...form, plannedReturnDate: event.target.value })
                }
              />
            </label>
            <label>
              Keperluan
              <textarea
                required
                minLength={3}
                value={form.purpose}
                onChange={event =>
                  setForm({ ...form, purpose: event.target.value })
                }
              />
            </label>
            <button className="primary-button" disabled={saving}>
              Kirim pengajuan
            </button>
          </>
        )}
      </form>
    </div>
  );
}

// =============================== Laporan (admin) ===============================

type LoanRow = Out["borrowing"]["list"][number];

function Reports() {
  const loans = trpc.borrowing.list.useQuery();
  const logs = trpc.audit.list.useQuery();
  const rows = loans.data ?? [];
  const count = (status: string) =>
    rows.filter(row => row.borrowing.status === status).length;

  return (
    <div className="simple-content">
      <div className="simple-heading">
        <div>
          <span className="eyebrow">Output sistem</span>
          <h2>Laporan</h2>
        </div>
        <button
          className="primary-button small"
          onClick={() => exportCsv(rows)}
        >
          Export CSV <Download size={15} />
        </button>
      </div>
      <div className="simple-columns">
        <section className="simple-panel">
          <span className="eyebrow">Rekap status</span>
          <h3>{rows.length} transaksi</h3>
          {["Dikembalikan", "Dipinjam", "Menunggu", "Terlambat", "Ditolak"].map(
            status => (
              <div className="report-line" key={status}>
                <span>{status}</span>
                <strong>{count(status)}</strong>
              </div>
            )
          )}
        </section>
        <section className="simple-panel">
          <span className="eyebrow">Audit log</span>
          <h3>Aktivitas sistem</h3>
          {(logs.data ?? []).slice(0, 8).map(log => (
            <div className="audit-line" key={log.id}>
              <strong>{log.action}</strong>
              <small>
                {log.detail} · {log.actorName} ·{" "}
                {new Date(log.createdAt).toLocaleString("id-ID")}
              </small>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// Sel yang diawali = + - @ bisa dibaca Excel sebagai rumus; beri tanda ' di depannya.
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

function exportCsv(rows: LoanRow[]) {
  const header = [
    "Nomor",
    "Barang",
    "Peminjam",
    "Jumlah",
    "Keperluan",
    "Tanggal pengajuan",
    "Rencana kembali",
    "Tanggal kembali",
    "Status",
    "Kondisi kembali",
    "Catatan",
  ];
  const lines = rows.map(({ borrowing: b, itemName }) =>
    [
      b.ticketNumber,
      itemName,
      b.borrowerName,
      b.quantity,
      b.purpose,
      formatDate(b.createdAt),
      formatDate(b.plannedReturnDate),
      formatDate(b.actualReturnDate),
      b.status,
      b.returnCondition,
      b.decisionNote,
    ]
      .map(csvCell)
      .join(",")
  );
  // BOM (\uFEFF) agar Excel membaca huruf UTF-8 dengan benar.
  const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );
  link.download = `laporan-pinjamku-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
