import Link from "next/link";
import { listClients } from "@/lib/clients";
import ClientsManager from "./ClientsManager";

export const dynamic = "force-dynamic";

export default function ClientsPage() {
  const initial = listClients();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Klanten</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Aan wie jij factureert. Voor EU B2B-klanten buiten Nederland vul je
          het BTW-nummer in zodat de factuur automatisch op 0% verlegd komt.
        </p>
      </header>

      <ClientsManager initial={initial} />
    </div>
  );
}
