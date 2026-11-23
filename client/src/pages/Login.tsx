import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type Mode = "masuk" | "daftar" | "tamu";

// Halaman login umum: masuk dengan akun, daftar akun baru, atau masuk sebagai tamu (cukup nama).
export default function Login() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("masuk");
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const set = (key: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [key]: value }));

  // Setelah berhasil, muat ulang data akun; Home otomatis pindah ke dashboard.
  const onSuccess = () => queryClient.invalidateQueries();
  const login = trpc.auth.login.useMutation({ onSuccess });
  const register = trpc.auth.register.useMutation({ onSuccess });
  const guest = trpc.auth.guest.useMutation({ onSuccess });
  const busy = login.isPending || register.isPending || guest.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "masuk") {
      login.mutate({ username: form.username, password: form.password });
    } else if (mode === "daftar") {
      register.mutate(form);
    } else {
      guest.mutate({ name: form.name });
    }
  };

  const copy = {
    masuk: {
      title: "Masuk",
      hint: "Masuk dengan akun Anda. Administrator dan pengguna terdaftar masuk dari sini.",
      button: "Masuk",
    },
    daftar: {
      title: "Buat akun",
      hint: "Daftar sekali, lalu riwayat peminjaman Anda tersimpan di akun.",
      button: "Daftar & masuk",
    },
    tamu: {
      title: "Masuk sebagai tamu",
      hint: "Tanpa akun. Cukup tulis nama untuk mengajukan peminjaman.",
      button: "Lanjut sebagai tamu",
    },
  }[mode];

  return (
    <form className="name-card" onSubmit={submit}>
      <div className="simple-logo">
        <b>P</b> PinjamKu
      </div>
      <span className="eyebrow">Peminjaman barang institusi</span>
      <div className="tabs" role="tablist">
        {(["masuk", "daftar", "tamu"] as Mode[]).map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={mode === item ? "active" : ""}
            onClick={() => setMode(item)}
          >
            {item === "masuk" ? "Masuk" : item === "daftar" ? "Daftar" : "Tamu"}
          </button>
        ))}
      </div>
      <h1>{copy.title}</h1>
      <p>{copy.hint}</p>

      {(mode === "daftar" || mode === "tamu") && (
        <label>
          Nama lengkap
          <input
            value={form.name}
            onChange={event => set("name", event.target.value)}
            placeholder="Contoh: Budi Santoso"
            autoComplete="name"
            required
            minLength={2}
          />
        </label>
      )}
      {mode !== "tamu" && (
        <>
          <label>
            Username
            <input
              value={form.username}
              onChange={event => set("username", event.target.value)}
              placeholder="huruf kecil, angka, titik, atau _"
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={event => set("password", event.target.value)}
              placeholder={mode === "daftar" ? "Minimal 8 karakter" : ""}
              autoComplete={
                mode === "daftar" ? "new-password" : "current-password"
              }
              required
              minLength={mode === "daftar" ? 8 : 1}
            />
          </label>
        </>
      )}
      <button className="primary-button full" disabled={busy}>
        {busy ? "Memproses..." : copy.button}
      </button>
    </form>
  );
}
