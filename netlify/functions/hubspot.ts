import { handleHubSpotRequest } from "../../scripts/hubspot/handler";

type NetlifyEvent = {
  httpMethod: string;
  path: string;
  rawUrl?: string;
  rawQuery?: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
};

function toResult(r: Awaited<ReturnType<typeof handleHubSpotRequest>>) {
  if (r.location) {
    return {
      statusCode: r.statusCode,
      headers: { ...(r.headers || {}), Location: r.location },
      body: r.body || "",
    };
  }
  return {
    statusCode: r.statusCode,
    headers: r.headers || { "Content-Type": "application/json; charset=utf-8" },
    body: r.body ?? "",
  };
}

export async function handler(event: NetlifyEvent) {
  const rawBody =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

  let pathname = event.path || "/";
  // Redirect /api/hubspot/* → function : path peut être /.netlify/functions/hubspot/...
  if (pathname.includes("/.netlify/functions/hubspot")) {
    const rest = pathname.split("/.netlify/functions/hubspot")[1] || "";
    pathname = `/api/hubspot${rest || ""}`;
  } else if (!pathname.includes("/api/hubspot")) {
    pathname = `/api/hubspot${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  }

  const query: Record<string, string | undefined> = {
    ...(event.queryStringParameters || {}),
  };

  return toResult(
    await handleHubSpotRequest({
      method: event.httpMethod,
      pathname,
      query,
      headers: event.headers || {},
      rawBody,
    }),
  );
}
