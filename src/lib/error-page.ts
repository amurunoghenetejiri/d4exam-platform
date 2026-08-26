export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>D4EXAM</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #0b1b3a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      .mark { width: 56px; height: 56px; margin: 0 auto 1rem; border-radius: 14px; background: #1e3a5f; display: grid; place-items: center; font-weight: 800; color: #93c5fd; }
      h1 { font-size: 1.15rem; margin: 0 0 0.5rem; }
      p { color: #94a3b8; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.55rem 1rem; border-radius: 0.5rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #2563eb; color: #fff; }
      .secondary { background: transparent; color: #e2e8f0; border-color: #334155; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="mark">D4</div>
      <h1>Couldn't open this page</h1>
      <p>If you are offline, connect once to download content. Otherwise try refreshing or go home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
