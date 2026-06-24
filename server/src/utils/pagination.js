export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const all = query.all === "1" || query.all === "true";
  const maxLimit = all ? 10000 : 100;
  const defaultLimit = all ? maxLimit : 10;
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginatedResponse(rows, total, page, limit) {
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
