"use client";

import { useEffect } from "react";

export default function LooplabErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("LoopLab editor boundary", error);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#efefec", color: "#252522", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>
      <section style={{ width: "min(100%, 640px)", border: "2px solid #3f3f3b", background: "#fffef7", padding: 24, boxShadow: "8px 8px 0 #3f3f3b" }}>
        <p style={{ margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".12em", fontSize: 11 }}>Recovery mode</p>
        <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>The editor hit an unexpected error</h1>
        <p style={{ lineHeight: 1.55 }}>Your IndexedDB project library is kept separately from this screen. Reload the editor, then export a <code>.loop.json</code> backup before continuing if the problem repeats.</p>
        <details style={{ margin: "16px 0" }}>
          <summary>Technical detail</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{error.message}</pre>
        </details>
        <button type="button" onClick={reset} style={{ minHeight: 44, border: "2px solid #3f3f3b", background: "#3f3f3b", color: "white", padding: "8px 16px", font: "inherit", cursor: "pointer" }}>Reload editor state</button>
      </section>
    </main>
  );
}
