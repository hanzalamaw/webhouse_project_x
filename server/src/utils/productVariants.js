/** Shopify-style product options → variant combinations */

function slugify(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "X";
}

export function variantComboKey(attributes = []) {
  return attributes
    .slice()
    .sort((a, b) => String(a.attribute_name).localeCompare(String(b.attribute_name)))
    .map((a) => `${String(a.attribute_name).trim()}=${String(a.value).trim()}`)
    .join("|");
}

export function comboKeyFromMap(combo = {}) {
  const attributes = Object.entries(combo).map(([attribute_name, value]) => ({
    attribute_name,
    value,
  }));
  return variantComboKey(attributes);
}

export function cartesianCombinations(options = []) {
  const normalized = options
    .map((o) => ({
      attribute_name: String(o.attribute_name || "").trim(),
      values: (Array.isArray(o.values) ? o.values : [])
        .map((v) => String(v).trim())
        .filter(Boolean),
    }))
    .filter((o) => o.attribute_name && o.values.length);

  if (!normalized.length) return [{}];

  return normalized.reduce(
    (acc, opt) => {
      const next = [];
      for (const row of acc) {
        for (const value of opt.values) {
          next.push({ ...row, [opt.attribute_name]: value });
        }
      }
      return next;
    },
    [{}]
  );
}

export function normalizeProductOptions(body) {
  const raw = body.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => ({
      attribute_name: String(o.attribute_name || "").trim(),
      values: (Array.isArray(o.values) ? o.values : [])
        .map((v) => String(v).trim())
        .filter(Boolean),
    }))
    .filter((o) => o.attribute_name && o.values.length);
}

export function reconstructOptionsFromVariants(variants = []) {
  const map = new Map();
  for (const v of variants) {
    for (const a of v.attributes || []) {
      const name = String(a.attribute_name || "").trim();
      const value = String(a.value || "").trim();
      if (!name || !value) continue;
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(value);
    }
  }
  return Array.from(map.entries()).map(([attribute_name, values]) => ({
    attribute_name,
    values: Array.from(values).sort(),
  }));
}

export function buildVariantName(combo, productName = "") {
  const parts = Object.values(combo).filter(Boolean);
  if (!parts.length) return productName || "Default";
  return parts.join(" / ");
}

export function buildDefaultSku(combo, { sku_prefix, product_name } = {}) {
  const prefix = slugify(sku_prefix || product_name || "SKU");
  const parts = Object.keys(combo)
    .sort()
    .map((k) => slugify(combo[k]));
  if (!parts.length) return prefix;
  return `${prefix}-${parts.join("-")}`.slice(0, 100);
}

export function comboToAttributes(combo) {
  return Object.entries(combo).map(([attribute_name, value]) => ({
    attribute_name,
    value,
  }));
}

/**
 * Build sellable variant rows from product-level options + optional per-row overrides.
 * @param {Array} options - [{ attribute_name, values: string[] }]
 * @param {object} ctx - { product_name, sku_prefix, default_cost_price, default_selling_price, status, variant_rows }
 */
export function buildVariantsFromOptions(options, ctx = {}) {
  const combos = cartesianCombinations(options);
  const rowByKey = new Map();
  for (const row of ctx.variant_rows || []) {
    if (row.combo_key) rowByKey.set(row.combo_key, row);
    else if (row.combo) rowByKey.set(comboKeyFromMap(row.combo), row);
    else if (row.attributes?.length) rowByKey.set(variantComboKey(row.attributes), row);
  }

  return combos.map((combo, index) => {
    const combo_key = comboKeyFromMap(combo);
    const override = rowByKey.get(combo_key) || {};
    const attributes = comboToAttributes(combo);
    const variant_name = buildVariantName(combo, ctx.product_name);
    const sku =
      String(override.sku || "").trim() ||
      buildDefaultSku(combo, { sku_prefix: ctx.sku_prefix, product_name: ctx.product_name });

    return {
      id: override.id ? Number(override.id) : null,
      combo_key,
      combo,
      sku,
      variant_name,
      cost_price: Number(override.cost_price ?? ctx.default_cost_price ?? 0),
      selling_price: Number(override.selling_price ?? ctx.default_selling_price ?? 0),
      status: override.status || ctx.status || "active",
      attributes,
      warehouse_stocks: Array.isArray(override.warehouse_stocks) ? override.warehouse_stocks : [],
      stock_levels: Array.isArray(override.stock_levels) ? override.stock_levels : [],
    };
  });
}

export function resolveVariantsFromBody(body, productName) {
  const options = normalizeProductOptions(body);
  if (options.length) {
    const variants = buildVariantsFromOptions(options, {
      product_name: productName,
      sku_prefix: body.sku_prefix,
      default_cost_price: body.default_cost_price ?? body.cost_price,
      default_selling_price: body.default_selling_price ?? body.selling_price,
      status: body.status,
      variant_rows: body.variants,
    });
    if (!variants.length) throw new Error("Add at least one value per attribute");
    return { options, variants };
  }

  // Simple product — no options, single default variant
  const sku = String(body.sku || body.variants?.[0]?.sku || "").trim();
  if (!sku) {
    const autoSku = buildDefaultSku({}, { sku_prefix: body.sku_prefix, product_name: productName });
    return {
      options: [],
      variants: [
        {
          id: body.variants?.[0]?.id ? Number(body.variants[0].id) : null,
          combo_key: "",
          combo: {},
          sku: autoSku,
          variant_name: productName || "Default",
          cost_price: Number(body.default_cost_price ?? body.cost_price ?? body.variants?.[0]?.cost_price ?? 0),
          selling_price: Number(body.default_selling_price ?? body.selling_price ?? body.variants?.[0]?.selling_price ?? 0),
          status: body.status || body.variants?.[0]?.status || "active",
          attributes: [],
          warehouse_stocks: body.variants?.[0]?.warehouse_stocks || body.warehouse_stocks || [],
          stock_levels: body.variants?.[0]?.stock_levels || [],
        },
      ],
    };
  }

  const v0 = body.variants?.[0] || body;
  return {
    options: [],
    variants: [
      {
        id: v0.id ? Number(v0.id) : null,
        combo_key: "",
        combo: {},
        sku,
        variant_name: String(v0.variant_name || productName || "Default").trim(),
        cost_price: Number(v0.cost_price ?? 0),
        selling_price: Number(v0.selling_price ?? 0),
        status: v0.status || body.status || "active",
        attributes: [],
        warehouse_stocks: v0.warehouse_stocks || [],
        stock_levels: v0.stock_levels || [],
      },
    ],
  };
}
