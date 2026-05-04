import { notFound } from "next/navigation";
import {
  getInvoiceByPublicToken,
  getRenderContext,
} from "@/lib/invoices";
import InvoiceViewClient from "./InvoiceViewClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Factuur",
  description: "Bekijk je factuur online",
  robots: "noindex, nofollow",
};

export default function InvoiceViewPage({
  params,
}: {
  params: { token: string };
}) {
  const invoice = getInvoiceByPublicToken(params.token);
  if (!invoice) notFound();

  const { company, client } = getRenderContext(invoice);

  return (
    <InvoiceViewClient
      token={params.token}
      number={invoice.number}
      status={invoice.status}
      language={invoice.language}
      totalCents={invoice.total_cents}
      issueDate={invoice.issue_date}
      dueDate={invoice.due_date}
      payUrl={invoice.mollie_payment_url}
      mollieStatus={invoice.mollie_status}
      paidAt={invoice.paid_at}
      companyName={company.name}
      companyEmail={company.email}
      companyPhone={company.phone}
      accentColor={company.accent_color || "#6366f1"}
      clientName={client.name}
    />
  );
}
