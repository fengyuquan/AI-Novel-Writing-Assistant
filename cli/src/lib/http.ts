import type { ApiResponse } from "@ai-novel/shared/types/api";

export class CliHttpError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "CliHttpError";
    this.status = status;
    this.details = details;
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
    const url = new URL(joinUrl(this.baseUrl, path));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return this.request<T>(url.toString(), { method: "GET" });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(joinUrl(this.baseUrl, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(joinUrl(this.baseUrl, path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(joinUrl(this.baseUrl, path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async requestRaw(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(joinUrl(this.baseUrl, path), init);
    return response;
  }

  private async request<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new CliHttpError(
        `无法连接后端（${this.baseUrl}）。请先在另一个终端运行 pnpm dev 或 pnpm dev:server。`,
        undefined,
        error,
      );
    }

    const text = await response.text();
    let payload: ApiResponse<T> | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as ApiResponse<T>;
      } catch {
        throw new CliHttpError(`后端返回了无法解析的内容（HTTP ${response.status}）。`, response.status, text);
      }
    }

    if (!response.ok || payload?.success === false) {
      const message = payload?.error || payload?.message || `请求失败（HTTP ${response.status}）`;
      throw new CliHttpError(message, response.status, payload);
    }

    if (!payload) {
      throw new CliHttpError(`后端返回空响应（HTTP ${response.status}）。`, response.status);
    }

    return payload;
  }
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
