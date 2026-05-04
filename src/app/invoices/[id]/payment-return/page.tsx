import { notFound } from "next/navigation";
import { getInvoiceWithLines, getRenderContext } from "@/lib/invoices";
import PaymentReturnClient from "./PaymentReturnClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Betaling",
  robots: "noindex, nofollow",
};

export default function PaymentReturnPage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = getInvoiceWithLines(params.id);
  if (!invoice) notFound();
  const { company } = getRenderContext(invoice);

  return (
    <PaymentReturnClient
      number={invoice.number}
      status={invoice.status}
      mollieStatus={invoice.mollie_status}
      totalCents={invoice.total_cents}
      companyName={company.name}
      companyEmail={company.email}
      accentColor={company.accent_color || "#6366f1"}
      language={invoice.language === "en" ? "en" : "nl"}
    />
  );
}
