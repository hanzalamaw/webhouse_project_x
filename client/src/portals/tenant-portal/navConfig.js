import { LogoutIcon, MoonIcon, ChevronIcon, ModuleIcon, HelpIcon } from "../../components/icons";

export { getTenantMenuItems, moduleBasePath } from "./modules/registry";

export const TENANT_FOOTER_ITEMS = {
  allModules: { label: "All Modules", path: "/app", icon: ModuleIcon },
  logout: { label: "Log Out", icon: LogoutIcon },
  nightMode: { label: "Night Mode", icon: MoonIcon },
  helpCenter: { label: "Help Center", path: "/app/m/admin/help-center", icon: HelpIcon },
};

export { ChevronIcon };
