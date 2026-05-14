type AnalyzeRequest = {
  type: "analyze-product";
  payload: unknown;
};

chrome.runtime.onMessage.addListener((message: AnalyzeRequest, _sender, sendResponse) => {
  if (message?.type !== "analyze-product") {
    return false;
  }

  void (async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/analyze-product", {
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
