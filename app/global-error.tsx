"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f6f7f1", color: "#18251f", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 24, textAlign: "center" }}>
        <main role="alert">
          <h1 style={{ fontSize: 28 }}>WildQuest hit a problem</h1>
          <p>Your saved adventures are still on this device. Please try again.</p>
          <button onClick={() => retry()} style={{ minHeight: 48, padding: "0 24px", borderRadius: 14, border: 0, background: "#1d5c42", color: "#fff", fontSize: 18, fontWeight: 700 }}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
