import { useEffect, useMemo, useState } from "react";
import type { AdminFieldMeta } from "@/lib/api";
import { isJsonField, tryFormatJson, validateJsonText } from "@/lib/fieldEditors";

interface LargeFieldEditorProps {
  field: AdminFieldMeta;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function LargeFieldEditor(props: LargeFieldEditorProps) {
  const jsonMode = isJsonField(props.field);
  const readOnly = Boolean(props.readOnly);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const charCount = props.value.length;
  const lineCount = props.value ? props.value.split("\n").length : 0;
  const jsonError = useMemo(
    () => (jsonMode ? validateJsonText(props.value) : null),
    [jsonMode, props.value],
  );

  useEffect(() => {
    setLocalError(jsonError);
  }, [jsonError]);

  function formatJson() {
    if (readOnly) return;
    const result = tryFormatJson(props.value);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    props.onChange(result.value);
    setLocalError(null);
  }

  const textareaClass =
    "w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none ring-offset-2 focus:ring-2 focus:ring-ring read-only:bg-muted";

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {jsonMode && !readOnly ? (
            <button type="button" onClick={formatJson} className="rounded border px-2 py-1 text-xs hover:bg-muted">
              格式化 JSON
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded border px-2 py-1 text-xs hover:bg-muted"
          >
            {readOnly ? "展开查看" : "展开编辑"}
          </button>
          <span className="text-[11px] text-muted-foreground">
            {charCount} 字符 · {lineCount} 行
            {jsonMode ? (localError ? " · JSON 无效" : props.value.trim() ? " · JSON 有效" : "") : ""}
          </span>
        </div>
        <textarea
          value={props.value}
          readOnly={readOnly}
          onChange={(event) => props.onChange(event.target.value)}
          rows={jsonMode ? 10 : 8}
          placeholder={props.placeholder}
          spellCheck={!jsonMode}
          className={`${textareaClass} min-h-[10rem]`}
        />
        {localError ? <p className="text-xs text-destructive">{localError}</p> : null}
      </div>

      {expanded ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-4 sm:p-8">
          <div className="flex h-full w-full max-w-5xl flex-col rounded-xl border bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <div className="font-medium">{props.field.name}</div>
                <div className="text-xs text-muted-foreground">
                  {props.field.type}
                  {jsonMode
                    ? readOnly
                      ? " · JSON 大字段查看"
                      : " · JSON 大字段编辑"
                    : readOnly
                      ? " · 大字段查看"
                      : " · 大字段编辑"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {jsonMode && !readOnly ? (
                  <button type="button" onClick={formatJson} className="rounded border px-3 py-1.5 text-sm">
                    格式化 JSON
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                >
                  {readOnly ? "关闭" : "完成编辑"}
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <textarea
                value={props.value}
                readOnly={readOnly}
                onChange={(event) => props.onChange(event.target.value)}
                placeholder={props.placeholder}
                spellCheck={!jsonMode}
                className={`${textareaClass} h-full min-h-0 flex-1 resize-none text-sm`}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {charCount} 字符 · {lineCount} 行
                </span>
                {localError ? (
                  <span className="text-destructive">{localError}</span>
                ) : jsonMode && props.value.trim() ? (
                  <span className="text-emerald-700">JSON 有效</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
