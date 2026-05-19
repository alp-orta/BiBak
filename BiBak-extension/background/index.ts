import { API_BASE_URL } from "~api/config";

type AnalyzeRequest = {
  type: "analyze-product";
  payload: unknown;
};

type AmazonFetchRequest = {
  type: "amazon-fetch";
  payload: {
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  };
};

type BackgroundRequest = AnalyzeRequest | AmazonFetchRequest;

function isAllowedAmazonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https:$/.test(url.protocol) && /(^|\.)amazon\.(com|com\.tr|co\.uk|de|fr|it|es)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  if (message?.type === "amazon-fetch") {
    void (async () => {
      try {
        const { url, method = "GET", headers = {}, body } = message.payload;
        if (!isAllowedAmazonUrl(url)) {
          sendResponse({ ok: false, status: 0, error: "Blocked non-Amazon fetch URL" });
          return;
        }

        const response = await fetch(url, {
          method,
          credentials: "include",
          headers,
          body: method === "POST" ? body : undefined
        });

        sendResponse({
          ok: response.ok,
          status: response.status,
          text: await response.text()
        });
      } catch (error) {
        sendResponse({
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "Unknown Amazon fetch error"
        });
      }
    })();

    return true;
  }

  if (message?.type !== "analyze-product") {
    return false;
  }

  void (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/analyze-product`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message.payload)
      });

      if (!response.ok) {
        sendResponse({
          ok: false,
          error: `Backend returned ${response.status}`
        });
        return;
      }

      sendResponse({
        ok: true,
        data: await response.json()
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown background fetch error"
      });
    }
  })();

  return true;
});
