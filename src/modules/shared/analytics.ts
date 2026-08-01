import "server-only";

/**
 * Server-side analytics behind an interface. No-op locally; PostHog when
 * NEXT_PUBLIC_POSTHOG_KEY is set. Events carry no PII beyond the hashed
 * distinct id the caller provides.
 */

export interface Analytics {
  track(
    event: string,
    distinctId: string,
    properties?: Record<string, unknown>,
  ): Promise<void>;
}

/** [DEV ADAPTER] Logs events instead of sending them anywhere. */
class DevAnalytics implements Analytics {
  async track(
    event: string,
    distinctId: string,
    properties?: Record<string, unknown>,
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[DEV ADAPTER] analytics: ${event}`, {
        distinctId,
        ...properties,
      });
    }
  }
}

class PostHogAnalytics implements Analytics {
  constructor(
    private apiKey: string,
    private host: string,
  ) {}

  async track(
    event: string,
    distinctId: string,
    properties?: Record<string, unknown>,
  ) {
    try {
      await fetch(`${this.host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          event,
          distinct_id: distinctId,
          properties: properties ?? {},
        }),
        cache: "no-store",
      });
    } catch (cause) {
      // Analytics must never break the calling action.
      console.error("PostHog capture failed:", cause);
    }
  }
}

let analytics: Analytics | undefined;

export function getAnalytics(): Analytics {
  if (!analytics) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    analytics = key ? new PostHogAnalytics(key, host) : new DevAnalytics();
  }
  return analytics;
}
