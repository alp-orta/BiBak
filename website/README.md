# BiBak Website

Static product website for BiBak.

## Local Preview

```bash
cd website
python3 -m http.server 5174
```

Open `http://localhost:5174`.

## Deployment

The site is plain static HTML/CSS/assets. Deploy the `website/` directory as the publish root on Netlify, Vercel, GitHub Pages, or any static host.

When the Chrome Web Store URL is ready, replace the placeholder CTA text with the real install link in:

- `index.html`
- `how-it-works.html`
- `examples.html`
- `privacy.html`
- `404.html`
