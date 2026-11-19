import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Brand className="mb-8 text-lg" />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
