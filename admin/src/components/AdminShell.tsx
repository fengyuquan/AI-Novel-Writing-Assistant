import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createAdminBackup,
  fetchAdminMeta,
  getWriteUnlocked,
  setStoredToken,
  setWriteUnlocked,
} from "@/lib/api";

interface AdminShellProps {
  subtitle?: string;
  children: ReactNode;
  sidebar?: ReactNode;
  topBar?: ReactNode;
}

export function AdminShell(props: AdminShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const onNovels = location.pathname.startsWith("/novels") || location.pathname === "/";
  const onModels = location.pathname.startsWith("/models");
  const onAudit = location.pathname.startsWith("/audit");
  const [writeUnlocked, setWriteUnlockedState] = useState(getWriteUnlocked());
  const [backupHint, setBackupHint] = useState(
    "改数或删除前请先备份数据库。本控制台不提供 migrate reset。",
  );
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchAdminMeta()
      .then((meta) => {
        if (meta.backupHint) setBackupHint(meta.backupHint);
      })
      .catch(() => {
        // keep default hint
      });
  }, []);

  function logout() {
    setStoredToken(null);
    setWriteUnlocked(false);
    navigate("/login", { replace: true });
  }

  function toggleWriteUnlock() {
    if (!writeUnlocked) {
      const ok = window.confirm(
        "开启高级写解锁后，才能修改默认只读的危险表（Chunk / Runtime / Snapshot 等）。\n请确认已备份，并清楚风险。",
      );
      if (!ok) return;
    }
    const next = !writeUnlocked;
    setWriteUnlocked(next);
    setWriteUnlockedState(next);
    window.dispatchEvent(new CustomEvent("admin-write-unlock-changed", { detail: { unlocked: next } }));
  }

  async function runBackup() {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await createAdminBackup();
      setBackupMessage(result.message);
    } catch (err) {
      setBackupMessage(err instanceof Error ? err.message : "备份失败");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-[hsl(var(--card-surface))]">
        <div className="border-b px-4 py-4">
          <div className="text-sm font-semibold tracking-tight">小说内容工作台</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {props.subtitle ?? "按内容阅读与轻量改数"}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-muted p-1 text-xs">
            <Link
              to="/novels"
              className={`rounded px-1.5 py-1.5 text-center ${onNovels ? "bg-white font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              小说库
            </Link>
            <Link
              to="/models"
              className={`rounded px-1.5 py-1.5 text-center ${onModels ? "bg-white font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              高级
            </Link>
            <Link
              to="/audit"
              className={`rounded px-1.5 py-1.5 text-center ${onAudit ? "bg-white font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              审计
            </Link>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{props.sidebar}</div>
        <div className="space-y-2 border-t p-3 text-xs text-muted-foreground">
          <div className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-2 text-amber-950">
            {backupHint}
          </div>
          <button
            type="button"
            disabled={backupBusy}
            onClick={() => void runBackup()}
            className="w-full rounded-md border bg-white px-2 py-1.5 text-left text-xs text-foreground disabled:opacity-50"
          >
            {backupBusy ? "正在备份…" : "立即备份 SQLite"}
          </button>
          {backupMessage ? (
            <div className="break-all rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed">
              {backupMessage}
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleWriteUnlock}
            className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
              writeUnlocked ? "border-red-300 bg-red-50 text-red-800" : "bg-white text-foreground"
            }`}
          >
            {writeUnlocked ? "高级写解锁：已开启" : "高级写解锁：关闭（危险表只读）"}
          </button>
          <button type="button" onClick={logout} className="block text-sm text-foreground underline">
            退出登录
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {props.topBar}
        {props.children}
      </main>
    </div>
  );
}
