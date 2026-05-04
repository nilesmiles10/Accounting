import { notFound } from "next/navigation";
import {
  getQuoteByPublicToken,
  getQuoteRenderContext,
} from "@/lib/quotes";
import AcceptClient from "./AcceptClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Offerte",
  description: "Bekijk en accepteer je offerte",
  robots: "noindex, nofollow",
};

export default function QuoteAcceptPage({
  params,
}: {
  params: { token: string };
}) {
  const quote = getQuoteByPublicToken(params.token);
  if (!quote) notFound();

  const { company, client } = getQuoteRenderContext(quote);

  return (
    <AcceptClient
      token={params.token}
      number={quote.number}
      status={quote.status}
      language={quote.language}
      totalCents={quote.total_cents}
      validUntil={quote.valid_until_date}
      acceptedByName={quote.accepted_by_name}
      rejectedByName={quote.rejected_by_name}
      companyName={company.name}
      companyEmail={company.email}
      companyPhone={company.phone}
      accentColor={company.accent_color || "#6366f1"}
      clientName={client.name}
    />
  );
}
