import { Badge } from "@/components/ui/badge";
import { UserRolesEditor } from "@/modules/admin/components/UserRolesEditor";
import { listUsersWithRoles, requireAdministrator } from "@/modules/admin/server";

export default async function AdminUsersPage() {
  const { user: actor } = await requireAdministrator();
  const users = await listUsersWithRoles();

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Role changes require a reason and are audited. Super administrator is
        managed at the database level only.
      </p>
      <ul className="mt-6 space-y-3">
        {users.map((user) => (
          <li key={user.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{user.display_name ?? user.email}</p>
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <span className="ml-auto flex gap-1">
                {user.roles.map((role) => (
                  <Badge key={role} variant="outline" className="text-xs">
                    {role.replaceAll("_", " ")}
                  </Badge>
                ))}
              </span>
            </div>
            <div className="mt-3">
              <UserRolesEditor
                userId={user.id}
                roles={user.roles}
                isSelf={user.id === actor.id}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
