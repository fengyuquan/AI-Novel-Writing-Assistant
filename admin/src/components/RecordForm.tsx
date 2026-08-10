import { useMemo, useState, type FormEvent } from "react";
import type { AdminFieldMeta, AdminModelMeta } from "@/lib/api";
import {
  coerceJsonFieldValue,
  isJsonField,
  isLargeTextField,
  prettyInitialJson,
  validateJsonText,
} from "@/lib/fieldEditors";
import { LargeFieldEditor } from "@/components/LargeFieldEditor";

interface RecordFormProps {
  model: AdminModelMeta;
  mode: "create" | "edit";
  initialValues?: Record<string, unknown>;
  submitting?: boolean;
  readOnly?: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  onCancel: () => void;
}

function editableFields(model: AdminModelMeta, mode: "create" | "edit"): AdminFieldMeta[] {
  return model.fields.filter((field) => {
    if (field.isRelation) return false;
    if (field.name === "createdAt" || field.name === "updatedAt") return false;
    if (mode === "edit" && field.isPrimaryKey) return false;
    return true;
  });
}

function toInputValue(field: AdminFieldMeta, value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (field.isSensitive) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  const text = String(value);
  if (isJsonField(field)) {
    return prettyInitialJson(text);
  }
  return text;
}

export function RecordForm(props: RecordFormProps) {
  const fields = useMemo(() => editableFields(props.model, props.mode), [props.model, props.mode]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.name] = toInputValue(field, props.initialValues?.[field.name]);
    }
    return next;
  });
  const [error, setError] = useState<string | null>(null);

  const hasLargeFields = fields.some((field) => isLargeTextField(field, values[field.name] ?? ""));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (props.readOnly) {
      return;
    }
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name] ?? "";
      if (props.mode === "edit" && field.isSensitive && raw.trim() === "") {
        continue;
      }
      if (field.type === "Boolean") {
        payload[field.name] = raw === "true";
        continue;
      }
      if ((field.type === "Int" || field.type === "Float" || field.type === "Decimal") && raw.trim() !== "") {
        payload[field.name] = Number(raw);
        continue;
      }
      if (raw.trim() === "") {
        payload[field.name] = null;
        continue;
      }
      if (isJsonField(field)) {
        const jsonError = validateJsonText(raw);
        if (jsonError) {
          setError(`字段 ${field.name} JSON 无效：${jsonError}`);
          return;
        }
        try {
          payload[field.name] = coerceJsonFieldValue(field, raw);
        } catch (err) {
          setError(`字段 ${field.name} JSON 无效：${err instanceof Error ? err.message : "无法解析"}`);
          return;
        }
        continue;
      }
      payload[field.name] = raw;
    }
    try {
      await props.onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col" data-wide={hasLargeFields ? "true" : "false"}>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {fields.map((field) => {
          const value = values[field.name] ?? "";
          const large = isLargeTextField(field, value);
          return (
            <label key={field.name} className="block text-sm">
              <span className="mb-1 flex flex-wrap items-center gap-2 font-medium">
                {field.name}
                <span className="text-xs font-normal text-muted-foreground">{field.type}</span>
                {isJsonField(field) ? (
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] text-violet-800">JSON</span>
                ) : null}
                {large && !isJsonField(field) ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">大文本</span>
                ) : null}
                {field.isSensitive ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">敏感</span>
                ) : null}
                {field.isForeignKey && field.relationTo ? (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800">
                    → {field.relationTo}
                  </span>
                ) : null}
              </span>
              {field.type === "Boolean" ? (
                <select
                  value={value || "false"}
                  disabled={props.readOnly}
                  onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  className="w-full rounded-md border px-3 py-2 disabled:bg-muted"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : large ? (
                <LargeFieldEditor
                  field={field}
                  value={value}
                  readOnly={props.readOnly}
                  onChange={(next) => setValues((prev) => ({ ...prev, [field.name]: next }))}
                  placeholder={field.isSensitive ? "留空表示不修改" : undefined}
                />
              ) : (
                <input
                  type={
                    field.type === "DateTime"
                      ? "text"
                      : field.type === "Int" || field.type === "Float"
                        ? "number"
                        : "text"
                  }
                  value={value}
                  readOnly={props.readOnly}
                  onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  placeholder={
                    field.isSensitive
                      ? "留空表示不修改"
                      : field.type === "DateTime"
                        ? "ISO 时间，如 2026-01-01T00:00:00.000Z"
                        : undefined
                  }
                  className="w-full rounded-md border px-3 py-2 read-only:bg-muted"
                />
              )}
            </label>
          );
        })}
      </div>
      {props.readOnly ? (
        <p className="border-t px-4 py-2 text-xs text-amber-800">当前为只读查看。若需修改，请在左侧开启「高级写解锁」。</p>
      ) : null}
      {error ? <p className="border-t px-4 py-2 text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t px-4 py-3">
        <button type="button" onClick={props.onCancel} className="rounded-md border px-3 py-1.5 text-sm">
          {props.readOnly ? "关闭" : "取消"}
        </button>
        {!props.readOnly ? (
          <>
            {props.model.readOnlyDefault ? (
              <span className="mr-auto text-xs text-amber-700">此表默认只读，需高级写解锁后服务端才接受写入</span>
            ) : null}
            <button
              type="submit"
              disabled={props.submitting}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {props.submitting ? "保存中…" : "保存"}
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}
