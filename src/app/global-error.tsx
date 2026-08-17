"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root-level error boundary. This is the only boundary that catches errors
 * thrown by the root layout itself, and it replaces the whole document when it
 * renders — so the layout's fonts and globals.css never load here. Styling is
 * inline for the same reason `/offline` is: nothing outside this file is
 * guaranteed to be available at the moment it renders.
 */

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          backgroundColor: "#f7faf8",
          color: "#1f2d2b",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.75rem",
              lineHeight: 1.2,
              margin: "0 0 0.75rem",
              fontWeight: 600,
            }}
          >
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1.5rem", color: "#596966" }}>
            The page failed to load. The error has been reported and we are
            looking into it.
          </p>
          {/*
            Deliberately a plain <a>, not next/link: this boundary renders when
            the root layout itself failed, so the client router is exactly the
            thing not to trust. A hard navigation reloads the whole app.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              backgroundColor: "#2f6f68",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Back to ThriveMap
          </a>
          {error.digest ? (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.8125rem",
                color: "#5f6e6b",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
