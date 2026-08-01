import { Badge } from "@/components/ui/badge";
import { listAdminActions, listAuditLogs, requireAdministrator } from "@/modules/admin/server";

export default async function AdminAuditPage() {
  await requireAdministrator();
  const [actions, logs] = await Promise.all([listAdminActions(100), listAuditLogs(100)]);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Moderation decisions and row-level changes on sensitive tables (latest
        100 each).
      </p>

      <section className="mt-6">
        <h2 className="font-heading text-lg font-semibold">Moderation actions</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Target</th>
                <th scope="col" className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(action.created_at).toLocaleString("en-PH")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{action.action.replaceAll("_", " ")}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {action.target_type}
                  </td>
                  <td className="px-3 py-2">{action.reason ?? "—"}</td>
                </tr>
              ))}
              {actions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    No moderation actions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-lg font-semibold">Row changes</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Table</th>
                <th scope="col" className="px-3 py-2 font-medium">Operation</th>
                <th scope="col" className="px-3 py-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("en-PH")}
                  </td>
                  <td className="px-3 py-2">{log.table_name}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{log.action}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {log.record_id ?? "—"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    No audit rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
