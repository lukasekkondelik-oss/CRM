import { BarChart3, Building2, CalendarCheck, Kanban, Settings, Truck, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/realizace", label: "Realizace", icon: Truck },
  { href: "/aktivity", label: "Aktivity", icon: CalendarCheck },
  { href: "/osoby", label: "Osoby", icon: Users },
  { href: "/firmy", label: "Firmy", icon: Building2 },
  { href: "/nastaveni", label: "Nastavení", icon: Settings },
];
