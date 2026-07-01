import { loginPortalUrl } from "../api/client";
import { formatPKR } from "./currency";

function row(label, value, options = {}) {
  const { copyValue, sensitive = false } = options;
  return { label, value: value ?? "—", copyValue, sensitive };
}

export function buildUserLoginSections({ loginLink, username, password }) {
  return [
    {
      title: "Sign-in details",
      rows: [
        row("Link", loginLink),
        row("Username", username),
        row("Password", password, { sensitive: true }),
      ],
    },
  ];
}

export function buildTenantAccountSections({
  tenant,
  credentials,
  modules = [],
  organization,
  payment,
}) {
  const loginPortal = tenant?.login_portal || credentials?.login_portal;
  const loginLink = loginPortal ? loginPortalUrl(loginPortal) : "—";

  const moduleNames =
    modules.length > 0
      ? modules.map((m) => m.module_name || m.name).filter(Boolean).join(", ")
      : "—";

  return [
    {
      title: "Sign-in details",
      rows: [
        row("Link", loginLink),
        row("Username", credentials?.username || credentials?.email),
        row("Password", credentials?.password, { sensitive: true }),
      ],
    },
    {
      title: "Company",
      rows: [
        row("Company", tenant?.company_name),
        row("Owner", tenant?.owner_name),
        row("Owner email", tenant?.owner_email),
        row("Owner phone", tenant?.owner_phone),
        row("Industry", tenant?.industry),
        row("Status", tenant?.status),
      ],
    },
    {
      title: "Subscription",
      rows: [
        row("Plan", tenant?.plan_name),
        row("Billing cycle", tenant?.billing_cycle),
        row("ERP portal", loginPortal?.toUpperCase()),
        row("Monthly total", tenant?.total_amount != null ? formatPKR(tenant.total_amount) : "—"),
        row("Amount due", tenant?.amount_due != null ? formatPKR(tenant.amount_due) : "—"),
      ],
    },
    {
      title: "Limits",
      rows: [
        row("Max users", tenant?.max_users),
        row("Max warehouses", tenant?.max_warehouses),
        row("Max stores", tenant?.max_stores),
        row("Max orders / month", tenant?.max_orders_per_month),
      ],
    },
    {
      title: "Modules",
      rows: [row("Enabled modules", moduleNames)],
    },
    {
      title: "Super admin",
      rows: [
        row("Name", credentials?.name),
        row("Email", credentials?.email),
        row("Username", credentials?.username),
      ],
    },
    ...(organization
      ? [
          {
            title: "Organization",
            rows: [
              row("Timezone", organization.timezone),
              row("Currency", organization.currency),
              row("Language", organization.language),
            ],
          },
        ]
      : []),
    ...(payment
      ? [
          {
            title: "Latest payment",
            rows: [
              row("Bank", payment.bank != null ? formatPKR(payment.bank) : "—"),
              row("Cash", payment.cash != null ? formatPKR(payment.cash) : "—"),
              row("Total received", payment.total_received != null ? formatPKR(payment.total_received) : "—"),
            ],
          },
        ]
      : []),
  ];
}
