"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section role="alert" aria-live="assertive" style={{ maxWidth: 520, textAlign: "center" }}>
            <h1>Application unavailable</h1>
            <p>The application could not start correctly. Please try again.</p>
            <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 20px", cursor: "pointer" }}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
