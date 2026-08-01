import { requireUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/modules/users/components/ProfileForm";

export default async function AccountPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      </div>
      <ProfileForm initialDisplayName={profile?.display_name ?? ""} />
    </div>
  );
}
