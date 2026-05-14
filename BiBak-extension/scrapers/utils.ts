export function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

export function queryAll(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function extractText(el: Element | null): string {
  if (!el) return "";
  return (el.textContent || "").trim();
}

export function extractNumber(text: string): number {
  const match = text.replace(/,/g, '.').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

export async function scrollToLoadReviews(): Promise<void> {
  return new Promise((resolve) => {
    // Basic scroll to bottom to trigger lazy loading
    window.scrollTo(0, document.body.scrollHeight);
    setTimeout(() => resolve(), 2000);
  });
}
