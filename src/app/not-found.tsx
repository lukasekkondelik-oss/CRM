import Link from "next/link";
import { Compass } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Brand className="text-lg" />
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground"><Compass className="size-7" /></span>
      <div>
        <h1 className="text-2xl font-semibold">Tuhle stránku jsme nenašli</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Odkaz může být zastaralý, nebo záznam už někdo smazal.</p>
      </div>
      <Link href="/pipeline" className={buttonVariants({ size: "lg" })}>Zpět na Pipeline</Link>
    </div>
  );
}
