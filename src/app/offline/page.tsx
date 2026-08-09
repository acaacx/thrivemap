import type { Metadata } from "next";
import { SNAPSHOT_KEY, SNAPSHOT_VERSION } from "@/modules/favorites/snapshot";

/**
 * This page is precached by the service worker (public/sw.js) and served
 * as the navigation fallback when the network is unreachable — so it must
 * render fully with ZERO external JS/CSS. Next.js's normal stylesheet and
 * chunk <link>/<script> tags are still emitted in <head> (unavoidable —
 * they're part of the shared root layout) but they are NOT precached, so
 * offline they simply fail to load. Everything this page needs to look
 * right and show real data must therefore live inline, right here:
 * - an inline <style> block (no Tailwind dependency)
 * - an inline <script> that reads the favorites snapshot straight out of
 *   localStorage and injects it into the DOM without React/hydration
 *
 * Do NOT reintroduce a "use client" component for the favorites list here
 * (there used to be one, OfflineFavorites) — with no JS chunks cached, it
 * never hydrates and its useEffect never runs, so it permanently renders
 * its SSR fallback ("No saved clinics on this device yet.") even when a
 * snapshot exists. That was the bug this page fixes.
 */

export const metadata: Metadata = {
  title: "You're offline",
  description: "Your saved clinics, available without a connection.",
  robots: { index: false, follow: false },
};

const OFFLINE_CSS = `
  .offline-page {
    margin: 0;
    min-height: 100vh;
    background: #fdfaf3;
    color: #3a3229;
    font-family: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  }
  .offline-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #e4ddd0;
  }
  .offline-brand {
    font-weight: 700;
    font-size: 1.125rem;
    color: #2f6763;
    letter-spacing: 0.01em;
  }
  .offline-main {
    max-width: 640px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }
  .offline-title {
    font-size: 1.75rem;
    line-height: 1.2;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }
  .offline-lede {
    color: #6b6255;
    margin: 0 0 2rem;
    line-height: 1.5;
  }
  #offline-empty {
    color: #6b6255;
    margin: 0;
  }
  #offline-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .offline-item {
    padding: 1rem 0;
    border-bottom: 1px solid #e4ddd0;
  }
  .offline-item:last-child {
    border-bottom: none;
  }
  .offline-item-name {
    font-weight: 700;
    margin: 0 0 0.25rem;
  }
  .offline-item-address {
    color: #6b6255;
    margin: 0 0 0.5rem;
  }
  .offline-item-tel {
    color: #2f6763;
    font-weight: 600;
    text-decoration: underline;
  }
  @media (prefers-color-scheme: dark) {
    .offline-page {
      background: #232019;
      color: #f0ece2;
    }
    .offline-header {
      border-bottom-color: #3a352b;
    }
    .offline-brand {
      color: #7fc2bd;
    }
    .offline-lede,
    #offline-empty,
    .offline-item-address {
      color: #b8b0a0;
    }
    .offline-item {
      border-bottom-color: #3a352b;
    }
    .offline-item-tel {
      color: #7fc2bd;
    }
  }
`;

// Reads the favorites snapshot directly out of localStorage and injects it
// into the DOM. No React, no framework, no external script file — this
// runs verbatim from the precached HTML with zero network access. Keep it
// dependency-free (no imports possible from an inline script string).
const OFFLINE_SCRIPT = `
(function () {
  var KEY = ${JSON.stringify(SNAPSHOT_KEY)};
  var VERSION = ${JSON.stringify(SNAPSHOT_VERSION)};
  var emptyEl = document.getElementById("offline-empty");
  var listEl = document.getElementById("offline-list");
  if (!emptyEl || !listEl) return;
  try {
    var raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== VERSION ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0
    ) {
      return;
    }
    parsed.items.forEach(function (item) {
      if (!item || typeof item.name !== "string" || typeof item.address !== "string") return;

      var li = document.createElement("li");
      li.className = "offline-item";

      var name = document.createElement("p");
      name.className = "offline-item-name";
      name.textContent = item.name;
      li.appendChild(name);

      var address = document.createElement("p");
      address.className = "offline-item-address";
      address.textContent = item.address;
      li.appendChild(address);

      if (item.phone) {
        var digits = String(item.phone).replace(/[^0-9+]/g, "");
        if (digits) {
          var tel = document.createElement("a");
          tel.className = "offline-item-tel";
          tel.href = "tel:" + digits;
          tel.textContent = item.phone;
          li.appendChild(tel);
        }
      }

      listEl.appendChild(li);
    });
    listEl.hidden = false;
    emptyEl.hidden = true;
  } catch (err) {
    // Corrupt or unreadable snapshot — leave the empty state in place.
  }
})();
`;

// Rendered via dangerouslySetInnerHTML (below) rather than plain JSX. This
// region's actual content is later mutated directly by OFFLINE_SCRIPT,
// outside of React entirely — if it were plain JSX, React's hydration
// would walk in expecting exactly this markup, find the script's injected
// <li> nodes instead, and treat that as a hydration mismatch: it discards
// the mismatched subtree and re-renders it from scratch on the client,
// wiping out the very content we just injected (confirmed via e2e: this
// happened whenever JS chunks *were* reachable — i.e. every case except
// the true zero-network one this page exists for). dangerouslySetInnerHTML
// makes the container opaque to hydration diffing, so the script's DOM
// mutations survive hydration instead of racing it.
const OFFLINE_CONTENT_HTML = `<p id="offline-empty">No saved clinics on this device yet.</p><ul id="offline-list" hidden></ul>`;

export default function OfflinePage() {
  return (
    <div className="offline-page">
      <style>{OFFLINE_CSS}</style>
      <header className="offline-header">
        <span className="offline-brand">ThriveMap</span>
      </header>
      <main id="main-content" className="offline-main">
        <h1 className="offline-title">You&rsquo;re offline</h1>
        <p className="offline-lede">
          Your saved clinics are below. Details may have changed — reconnect for
          current information.
        </p>
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: OFFLINE_CONTENT_HTML }}
        />
      </main>
      {/* dangerouslySetInnerHTML here is a compile-time constant, not user
          input — required so this runs with zero external JS/CSS */}
      <script dangerouslySetInnerHTML={{ __html: OFFLINE_SCRIPT }} />
    </div>
  );
}
