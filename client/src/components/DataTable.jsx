export function DataTable({ columns, rows, rowKey = "id", emptyMessage = "No records found." }) {
  return (
    <div className="wh-table-wrap">
      <table className="wh-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key || col.label}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows?.length ? (
            <tr>
              <td colSpan={columns.length} className="wh-table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row[rowKey]}>
                {columns.map((col) => (
                  <td key={col.key || col.label}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
