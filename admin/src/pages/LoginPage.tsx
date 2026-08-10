import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminStatus, getStoredToken, loginAdmin, setStoredToken } from "@/lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchAdminStatus()
      .then((status) => {
        setEnabled(status.enabled);
        if (status.enabled && getStoredToken()) {
          navigate("/novels", { replace: true });
        }
      })
      .catch((err: unknown) => {
        setEnabled(false);
        setError(err instanceof Error ? err.message : "无法连接服务端");
      });
  }, [navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await loginAdmin(token.trim());
      setStoredToken(result.token);
      navigate("/novels", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#f7f9fc_0%,#eef3f8_45%,#e7eef6_100%)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border bg-white/90 p-8 shadow-sm backdrop-blur"
      >
        <h1 className="text-2xl font-semibold tracking-tight">小说内容工作台</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          用服务端配置的 ADMIN_TOKEN 登录，按小说阅读章节、角色与任务，并在需要时改数。
        </p>

        {enabled === false ? (
          <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            管理后台未启用。请在 `server/.env` 设置 `ADMIN_TOKEN` 后重启 API。
          </div>
        ) : null}

        <label className="mt-6 block text-sm font-medium">
          管理口令
          <input
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            placeholder="ADMIN_TOKEN"
            disabled={enabled === false || loading}
          />
        </label>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <button
          type="submit"
          disabled={enabled === false || loading || !token.trim()}
          className="mt-6 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "登录中…" : "进入工作台"}
        </button>
      </form>
    </div>
  );
}
