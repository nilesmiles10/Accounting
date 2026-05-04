import { getEmailSettings } from "@/lib/settings";
import { log } from "@/lib/logger";

export interface MessageStats {
  message_id: string;
  status: string | null;
  delivered_at: string | null;
  opens: number;
  last_opened_at: string | null;
  clicks: number;
  last_clicked_at: string | null;
  bounced: boolean;
  bounce_reason: string | null;
}

interface OpensResponse {
  TotalCount?: number;
  Opens?: Array<{ ReceivedAt?: string }>;
}
interface ClicksResponse {
  TotalCount?: number;
  Clicks?: Array<{ ReceivedAt?: string }>;
}
interface MessageDetails {
  Status?: string;
  ReceivedAt?: string;
  MessageEvents?: Array<{ Type?: string; ReceivedAt?: string }>;
}

/**
 * Hit Postmark's REST API direct — versie-agnostisch. De SDK-types wisselen
 * tussen minor versies, maar de REST-endpoints zijn stabiel.
 * Docs: https://postmarkapp.com/developer/api/messages-api
 */
export async function getPostmarkStats(
  messageId: string,
): Promise<MessageStats | null> {
  if (!messageId) return null;
  if (messageId.startsWith("test-")) {
    return {
      message_id: messageId,
      status: "test",
      delivered_at: null,
      opens: 0,
      last_opened_at: null,
      clicks: 0,
      last_clicked_at: null,
      bounced: false,
      bounce_reason: null,
    };
  }

  const { postmark_server_token } = getEmailSettings();
  if (!postmark_server_token) return null;

  const headers = {
    Accept: "application/json",
    "X-Postmark-Server-Token": postmark_server_token,
  };

  try {
    // Per-bericht endpoints (path-parameter, niet query) — die accepteren
    // alleen de MessageID zelf en geven {TotalCount, Opens/Clicks}.
    const [detailsRes, opensRes, clicksRes] = await Promise.all([
      fetch(
        `https://api.postmarkapp.com/messages/outbound/${messageId}/details`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `https://api.postmarkapp.com/messages/outbound/opens/${messageId}?count=100&offset=0`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `https://api.postmarkapp.com/messages/outbound/clicks/${messageId}?count=100&offset=0`,
        { headers, cache: "no-store" },
      ),
    ]);

    const details = (detailsRes.ok
      ? await detailsRes.json()
      : {}) as MessageDetails;
    const opens = (opensRes.ok ? await opensRes.json() : {}) as OpensResponse;
    const clicks = (clicksRes.ok
      ? await clicksRes.json()
      : {}) as ClicksResponse;

    const opensList = opens.Opens || [];
    const clicksList = clicks.Clicks || [];

    const deliveredEvent = (details.MessageEvents || []).find(
      (e) => e.Type === "Delivered",
    );

    return {
      message_id: messageId,
      status: details.Status ?? null,
      delivered_at: deliveredEvent?.ReceivedAt || details.ReceivedAt || null,
      opens: opens.TotalCount ?? opensList.length,
      last_opened_at: opensList[0]?.ReceivedAt || null,
      clicks: clicks.TotalCount ?? clicksList.length,
      last_clicked_at: clicksList[0]?.ReceivedAt || null,
      bounced: details.Status === "Bounced",
      bounce_reason: null,
    };
  } catch (err) {
    log.error(
      {
        scope: "accounting/postmark-stats",
        message_id: messageId,
        err: err instanceof Error ? err.message : String(err),
      },
      "postmark stats fetch failed",
    );
    return null;
  }
}
