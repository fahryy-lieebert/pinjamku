import sys, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
errors = []
def check(name, cond):
    print(("  ✓ " if cond else "  ✗ ") + name)
    if not cond: errors.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: logs.append(str(e)))
    unauthorized = []
    page.on("response", lambda r: unauthorized.append(r.url) if r.status == 401 else None)

    page.goto(BASE); page.wait_for_selector(".name-card")
    check("halaman login tampil", "Masuk" in page.inner_text(".name-card"))
    page.screenshot(path="/tmp/shots/1-login.png")
    page.click("text=Daftar >> nth=0") if False else page.click(".tabs button:nth-child(3)")
    check("tab Tamu hanya meminta nama", page.locator(".name-card input").count() == 1)

    # login salah -> toast / tetap di login
    page.click(".tabs button:nth-child(1)")
    page.fill("input[autocomplete=username]", "admin"); page.fill("input[type=password]", "salahsalah")
    page.click(".primary-button.full"); page.wait_for_timeout(800)
    check("password salah: tetap di halaman login + ada pesan", page.locator(".name-card").count() == 1 and "salah" in page.inner_text("body").lower())

    page.fill("input[type=password]", "admin123"); page.click(".primary-button.full")
    page.wait_for_selector(".simple-app")
    check("admin masuk ke dashboard", "Administrator" in page.inner_text(".simple-account"))
    check("status database terhubung", "Database terhubung" in page.inner_text(".simple-top"))
    page.screenshot(path="/tmp/shots/2-dashboard-admin.png")
    for label, marker in [("Data Barang", "Proyektor"), ("Peminjaman", "Peminjaman"), ("Laporan", "Export CSV")]:
        page.click(f".simple-side nav >> text={label}"); page.wait_for_timeout(500)
        check(f"menu {label} terbuka", marker in page.inner_text(".simple-main"))
    page.click(".simple-side nav >> text=Data Barang"); page.wait_for_timeout(400)
    page.screenshot(path="/tmp/shots/3-items-admin.png")
    code = f"UI-{int(time.time())%100000}"
    page.click("text=Tambah barang")
    inputs = page.locator(".form-card input")
    page.fill(".form-card label:has-text('Kode barang') input", code)
    page.fill(".form-card label:has-text('Nama barang') input", "Barang UI")
    page.fill(".form-card label:has-text('Lokasi') input", "Gudang UI")
    page.click(".form-card .primary-button"); page.wait_for_timeout(800)
    check("tambah barang lewat UI", code in page.inner_text(".simple-table"))
    page.click(f"tr:has-text('{code}') button[title=Ubah]"); page.wait_for_selector(".form-card")
    page.fill(".form-card label:has-text('Nama barang') input", "Barang UI Edit")
    page.click(".form-card .primary-button"); page.wait_for_timeout(800)
    check("edit barang lewat UI", "Barang UI Edit" in page.inner_text(".simple-table"))
    page.once("dialog", lambda d: d.accept())
    page.click(f"tr:has-text('{code}') button[title=Hapus]"); page.wait_for_timeout(800)
    check("hapus barang lewat UI", code not in page.inner_text(".simple-table"))
    page.click("text=Keluar"); page.wait_for_selector(".name-card")
    check("logout kembali ke login", True)

    # alur tamu: ajukan peminjaman
    page.click(".tabs button:nth-child(3)"); page.fill(".name-card input", "Tamu Playwright"); page.click(".primary-button.full")
    page.wait_for_selector(".simple-app")
    check("tamu masuk (label Tamu, tanpa menu Laporan)", "Tamu" in page.inner_text(".simple-account") and page.locator(".simple-side nav >> text=Laporan").count() == 0)
    page.click(".simple-side nav >> text=Peminjaman")
    page.click("text=Ajukan baru"); page.wait_for_selector(".form-card")
    page.fill(".form-card textarea", "Presentasi kelas"); page.click(".form-card .primary-button")
    page.wait_for_timeout(1000)
    check("tamu berhasil mengajukan & melihat transaksinya", "Presentasi kelas" in page.inner_text(".simple-table") and "Menunggu" in page.inner_text(".simple-table"))
    page.screenshot(path="/tmp/shots/4-loans-guest.png")
    # setelah reload sesi tetap ada
    page.reload(); page.wait_for_selector(".simple-app")
    check("sesi bertahan setelah reload", True)
    b.close()
    # 401 hanya boleh berasal dari percobaan login dengan password salah (disengaja).
    check(f"401 hanya dari login salah: {unauthorized}", len(unauthorized) == 1 and "auth.login" in unauthorized[0])
    bad = [l for l in logs if "favicon" not in l and "401" not in l]
    check(f"tidak ada error console ({len(bad)}): {bad[:2]}", not bad)
print("GAGAL" if errors else "SEMUA LULUS"); sys.exit(1 if errors else 0)
