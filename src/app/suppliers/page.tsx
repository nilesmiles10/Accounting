import Link from "next/link";
import { listSuppliers } from "@/lib/suppliers";
import SuppliersManager from "./SuppliersManager";

export const dynamic = "force-dynamic";

export default function SuppliersPage() {
  const initial = listSuppliers();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Leveranciers</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Aan wie jij betaalt. Inkoopfacturen worden hieraan gekoppeld
          tijdens OCR/handmatig invoeren.
        </p>
      </header>
      <SuppliersManager initial={initial} />
    </div>
  );
}
