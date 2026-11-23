"""Uji alur PinjamKu lewat API tRPC (butuh server jalan). Pemakaian: python3 scripts/e2e.py http://localhost:3100"""
import json, sys, urllib.request, urllib.error, http.cookiejar, subprocess, time, uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
ok = fail = 0

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def call(self, proc, data=None, mutation=False):
        url = f"{BASE}/api/trpc/{proc}"
        if mutation:
            req = urllib.request.Request(url, data=json.dumps({"json": data}).encode(), headers={"Content-Type": "application/json"}, method="POST")
        else:
            if data is not None:
                url += "?input=" + urllib.parse.quote(json.dumps({"json": data}))
            req = urllib.request.Request(url)
        try:
            r = self.op.open(req); body = json.loads(r.read())
            return 200, body["result"]["data"]["json"]
        except urllib.error.HTTPError as e:
            body = json.loads(e.read()); err = body["error"]["json"]
            return e.code, err["message"]

import urllib.parse
def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  ✓ {name}")
    else: fail += 1; print(f"  ✗ {name} {extra}")

def sql(q):
    return subprocess.run(["mysql", "-uroot", "pinjamku", "-N", "-e", q], capture_output=True, text=True).stdout.strip()

anon, admin, guest, budi = Client(), Client(), Client(), Client()
suffix = uuid.uuid4().hex[:6]
tomorrow = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400))
yesterday = time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400))

print("Login & akses")
check("me tanpa login = null", anon.call("auth.me") == (200, None))
check("catalog.list tanpa login ditolak", anon.call("catalog.list")[0] == 401)
check("login password salah ditolak", admin.call("auth.login", {"username": "admin", "password": "salah"}, True)[0] == 401)
s, u = admin.call("auth.login", {"username": "Admin", "password": "admin123"}, True)
check("login admin berhasil (username tak peka huruf besar)", s == 200 and u["role"] == "admin" and "passwordHash" not in u, str(u))
check("me setelah login", admin.call("auth.me")[1]["username"] == "admin")
s, u = budi.call("auth.register", {"name": "Budi Santoso", "username": f"budi_{suffix}", "password": "rahasia123"}, True)
check("daftar akun baru = role user", s == 200 and u["role"] == "user", str(u))
check("username kembar ditolak", budi.call("auth.register", {"name": "Lain", "username": f"budi_{suffix}", "password": "rahasia123"}, True)[0] == 409)
check("password pendek ditolak", Client().call("auth.register", {"name": "X Y", "username": "xyzabc", "password": "123"}, True)[0] == 400)
s, u = guest.call("auth.guest", {"name": "Tamu Uji"}, True)
check("masuk sebagai tamu", s == 200 and u["loginMethod"] == "guest", str(u))

print("Hak akses")
items = admin.call("catalog.list")[1]
item = next(r for r in items if r["item"]["code"] == "BRG-003")["item"]
start = item["availableQuantity"]
check("admin tidak bisa dibuat lewat register", sql("select count(*) from users where role='admin'") == "1")
check("user tidak boleh tambah barang", budi.call("catalog.create", {"code": "X-1", "name": "Tes", "category": "Tes", "totalQuantity": 1, "condition": "Baik", "location": "Gudang"}, True)[0] == 403)
check("user tidak boleh buka audit log", budi.call("audit.list")[0] == 403)
check("tamu bisa lihat barang", guest.call("catalog.list")[0] == 200)

print("Alur peminjaman")
s, r = budi.call("borrowing.create", {"itemId": item["id"], "quantity": 1, "purpose": "Dokumentasi acara", "plannedReturnDate": tomorrow}, True)
check("user mengajukan peminjaman", s == 200 and r["ticket"].startswith("PJ-"), str(r))
bid = r["id"]
check("stok belum berkurang saat Menunggu", sql(f"select availableQuantity from items where id={item['id']}") == str(start))
check("pengajuan > stok ditolak", budi.call("borrowing.create", {"itemId": item["id"], "quantity": 999, "purpose": "Banyak", "plannedReturnDate": tomorrow}, True)[0] == 400)
check("tanggal kembali di masa lalu ditolak", budi.call("borrowing.create", {"itemId": item["id"], "quantity": 1, "purpose": "Lampau", "plannedReturnDate": yesterday}, True)[0] == 400)
check("user tidak bisa menyetujui sendiri", budi.call("borrowing.approve", {"id": bid}, True)[0] == 403)
check("tamu tidak melihat transaksi orang lain", all(x["borrowing"]["id"] != bid for x in guest.call("borrowing.list")[1]))
check("user melihat transaksinya", any(x["borrowing"]["id"] == bid for x in budi.call("borrowing.list")[1]))
check("admin menyetujui", admin.call("borrowing.approve", {"id": bid}, True)[0] == 200)
check("stok berkurang 1", sql(f"select availableQuantity from items where id={item['id']}") == str(start - 1))
check("approve ganda ditolak (stok tak berkurang dua kali)", admin.call("borrowing.approve", {"id": bid}, True)[0] == 409 and sql(f"select availableQuantity from items where id={item['id']}") == str(start - 1))
check("reject setelah approve ditolak", admin.call("borrowing.reject", {"id": bid, "note": "Batal"}, True)[0] == 409)
sql(f"update borrowings set plannedReturnDate = now() - interval 1 day where id={bid}")
st = next(x for x in admin.call("borrowing.list")[1] if x["borrowing"]["id"] == bid)["borrowing"]["status"]
check("lewat tanggal otomatis Terlambat", st == "Terlambat", st)
check("pengembalian berhasil", admin.call("borrowing.return", {"id": bid, "condition": "Baik dan lengkap"}, True)[0] == 200)
check("stok kembali semula", sql(f"select availableQuantity from items where id={item['id']}") == str(start))
check("return ganda ditolak (stok tak bertambah lagi)", admin.call("borrowing.return", {"id": bid, "condition": "Baik"}, True)[0] == 409 and sql(f"select availableQuantity from items where id={item['id']}") == str(start))

print("Penolakan & barang")
s, r = budi.call("borrowing.create", {"itemId": item["id"], "quantity": 1, "purpose": "Uji tolak", "plannedReturnDate": tomorrow}, True)
check("reject tanpa alasan ditolak validasi", admin.call("borrowing.reject", {"id": r["id"], "note": ""}, True)[0] == 400)
check("reject dengan alasan", admin.call("borrowing.reject", {"id": r["id"], "note": "Dipakai acara lain"}, True)[0] == 200)
check("stok tetap setelah reject", sql(f"select availableQuantity from items where id={item['id']}") == str(start))
code = f"T-{suffix}"
new = {"code": code, "name": "Barang Uji", "category": "Kategori Baru", "totalQuantity": 2, "condition": "Baik", "location": "Gudang"}
s, r = admin.call("catalog.create", new, True)
check("admin tambah barang + kategori baru", s == 200, str(r))
nid = r["id"]
check("kode barang kembar ditolak (409)", admin.call("catalog.create", new, True)[0] == 409)
check("edit barang", admin.call("catalog.update", {"id": nid, "data": {**new, "name": "Barang Uji 2", "totalQuantity": 5}}, True)[0] == 200 and sql(f"select name,totalQuantity,availableQuantity from items where id={nid}") == "Barang Uji 2\t5\t5")
s, r = budi.call("borrowing.create", {"itemId": nid, "quantity": 1, "purpose": "Uji hapus", "plannedReturnDate": tomorrow}, True)
check("hapus barang dengan transaksi aktif ditolak", admin.call("catalog.remove", {"id": nid}, True)[0] == 409)
admin.call("borrowing.reject", {"id": r["id"], "note": "Uji"}, True)
check("hapus barang tanpa transaksi aktif", admin.call("catalog.remove", {"id": nid}, True)[0] == 200)
check("audit log tercatat", len(admin.call("audit.list")[1]) >= 5)

print("Sesi & keamanan")
admin.call("auth.logout", None, True)
check("setelah logout me = null", admin.call("auth.me") == (200, None))
bad = Client()
for _ in range(5): bad.call("auth.login", {"username": f"tebak_{suffix}", "password": "x"}, True)
check("percobaan login gagal berulang dibatasi (429)", bad.call("auth.login", {"username": f"tebak_{suffix}", "password": "x"}, True)[0] == 429)
tok = [c.value for c in budi.jar if c.name == "pinjamku_session"][0]
forged = Client(); forged.op.addheaders = [("Cookie", "pinjamku_session=" + tok[:-3] + "abc")]
check("token dipalsukan ditolak", forged.call("auth.me") == (200, None))
print(f"\nHasil: {ok} lulus, {fail} gagal"); sys.exit(1 if fail else 0)
