export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;

  return (
    <div className="wh-pagination">
      <span className="wh-pagination__info">
        Page {page} of {totalPages} ({total} total)
      </span>
      <div className="wh-pagination__controls">
        <button
          type="button"
          className="wh-btn wh-btn--secondary wh-btn--sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="wh-btn wh-btn--secondary wh-btn--sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
