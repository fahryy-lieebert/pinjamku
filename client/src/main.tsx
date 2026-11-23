import { trpc } from "@/lib/trpc";
import { errorMessage } from "@/lib/errors";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import "./index.css";

// Sesi habis / belum login: muat ulang data akun supaya layar kembali ke halaman login.
const handleUnauthorized = (error: unknown) => {
  if (errorMessage(error) === UNAUTHED_ERR_MSG) {
    queryClient.invalidateQueries();
    return true;
  }
  return false;
};

const queryClient: QueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  queryCache: new QueryCache({
    onError: error => {
      handleUnauthorized(error);
      console.error("[API Query Error]", error);
    },
  }),
  // Semua error dari aksi (simpan, setujui, tolak, dst.) tampil sebagai notifikasi.
  mutationCache: new MutationCache({
    onError: error => {
      if (!handleUnauthorized(error)) toast.error(errorMessage(error));
    },
  }),
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
