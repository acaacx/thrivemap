import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Therapist {
  id: string;
  full_name: string;
  credentials: string | null;
  profession: string;
  specialties: string[];
  bio: string | null;
  photo_path: string | null;
  display_order: number;
  created_at: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Public storage URL for a clinic-images object (public bucket). */
function photoUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/clinic-images/${path}`;
}

export function CareTeamSection({ therapists }: { therapists: Therapist[] }) {
  if (therapists.length === 0) return null;
  const ordered = [...therapists].sort(
    (a, b) =>
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          <h2>Care team</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ordered.map((therapist) => (
            <li
              key={therapist.id}
              className="flex gap-3 rounded-xl border bg-card p-4"
            >
              <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                {therapist.photo_path ? (
                  <Image
                    src={photoUrl(therapist.photo_path)}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span
                    aria-hidden
                    className="font-heading text-lg text-secondary-foreground"
                  >
                    {initials(therapist.full_name)}
                  </span>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {therapist.full_name}
                  {therapist.credentials && (
                    <span className="text-muted-foreground">
                      , {therapist.credentials}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {therapist.profession}
                </p>
                {therapist.specialties.length > 0 && (
                  <p className="flex flex-wrap gap-1.5 pt-1">
                    {therapist.specialties.map((specialty) => (
                      <Badge key={specialty} variant="outline">
                        {specialty}
                      </Badge>
                    ))}
                  </p>
                )}
                {therapist.bio && (
                  <p className="pt-1 text-sm leading-relaxed text-foreground/90">
                    {therapist.bio}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
