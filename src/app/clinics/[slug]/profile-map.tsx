"use client";

import dynamic from "next/dynamic";

const ClinicMap = dynamic(
  () => import("@/modules/maps/components/ClinicMap").then((m) => m.ClinicMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-56 place-items-center bg-secondary text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);

interface ClinicProfileMapProps {
  clinicId: string;
  slug: string;
  clinicName: string;
  latitude: number;
  longitude: number;
  verified: boolean;
}

export function ClinicProfileMap(props: ClinicProfileMapProps) {
  return (
    <div className="h-56">
      <ClinicMap
        markers={[
          {
            id: props.clinicId,
            slug: props.slug,
            name: props.clinicName,
            latitude: props.latitude,
            longitude: props.longitude,
            verified: props.verified,
          },
        ]}
        center={{ latitude: props.latitude, longitude: props.longitude }}
        zoom={15}
        className="h-full w-full"
      />
    </div>
  );
}
