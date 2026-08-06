import type { ReportedInquiryThread } from "../server";

/**
 * Read-only view of the inquiry thread behind a report. The RPC is the
 * only admin read path into inquiry content, so this never talks to the
 * inquiries tables directly.
 */
export function ReportedConversationPanel({
  thread,
}: {
  thread: ReportedInquiryThread;
}) {
  const { inquiry, messages } = thread;

  return (
    <div className="mt-3 rounded-xl border bg-background p-4">
      <h3 className="font-heading text-sm font-semibold">
        Reported conversation
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {inquiry.subject} · {inquiry.status.replaceAll("_", " ")}
      </p>
      {messages.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No messages.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className="rounded-lg border bg-card p-3 text-sm"
            >
              <p>
                <span className="font-medium">[{message.sender_role}]</span>{" "}
                {message.body}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(message.created_at).toLocaleString("en-PH")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
