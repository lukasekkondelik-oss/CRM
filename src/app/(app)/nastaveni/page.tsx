import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { SettingsView } from "@/components/settings/settings-view";
import { EmptyState } from "@/components/ui/empty-state";
import { loadSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Nastavení" };
const TABS = ["team", "pipelines", "labels", "import"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const data = await loadSettings();
  if (!data) return <EmptyState icon={Settings} title="Nastavení se nepodařilo načíst" description="Zkus stránku obnovit." />;
  return <SettingsView data={data} initialTab={TABS.find((t) => t === tab) ?? "team"} />;
}
