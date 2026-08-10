interface ColumnPickerProps {
  allColumns: string[];
  visibleColumns: string[];
  onChange: (columns: string[]) => void;
}

export function ColumnPicker(props: ColumnPickerProps) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        列设置
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-white p-2 shadow-lg">
        <div className="max-h-64 space-y-1 overflow-auto text-sm">
          {props.allColumns.map((column) => {
            const checked = props.visibleColumns.includes(column);
            return (
              <label key={column} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      if (props.visibleColumns.length <= 1) return;
                      props.onChange(props.visibleColumns.filter((item) => item !== column));
                    } else {
                      props.onChange([...props.visibleColumns, column]);
                    }
                  }}
                />
                <span className="truncate">{column}</span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}
