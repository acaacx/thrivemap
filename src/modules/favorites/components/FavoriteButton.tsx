"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { removeFavorite, saveFavorite } from "../actions";

interface FavoritesPayload {
  clinicIds: string[];
  signedIn: boolean;
}

function useFavorites() {
  return useQuery<FavoritesPayload>({
    queryKey: ["favorites"],
    queryFn: async () => {
      const res = await fetch("/api/favorites");
      // Throw so react-query retries — a cached failure would otherwise pin
      // the button to "signed out / not favorited" for the whole staleTime.
      if (!res.ok) throw new Error("favorites fetch failed");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function FavoriteButton({
  clinicId,
  clinicName,
  className,
}: {
  clinicId: string;
  clinicName: string;
  className?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useFavorites();
  const favorited = data?.clinicIds.includes(clinicId) ?? false;

  const mutation = useMutation({
    mutationFn: async (nextFavorited: boolean) => {
      const result = nextFavorited
        ? await saveFavorite(clinicId)
        : await removeFavorite(clinicId);
      if (result.error) throw new Error(result.error);
    },
    onMutate: async (nextFavorited) => {
      await queryClient.cancelQueries({ queryKey: ["favorites"] });
      const previous = queryClient.getQueryData<FavoritesPayload>([
        "favorites",
      ]);
      queryClient.setQueryData<FavoritesPayload>(["favorites"], (old) => ({
        signedIn: old?.signedIn ?? true,
        clinicIds: nextFavorited
          ? [...(old?.clinicIds ?? []), clinicId]
          : (old?.clinicIds ?? []).filter((id) => id !== clinicId),
      }));
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous)
        queryClient.setQueryData(["favorites"], context.previous);
      toast.error(error.message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  function onClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (data && !data.signedIn) {
      toast.info("Sign in to save favorites.");
      router.push("/login");
      return;
    }
    mutation.mutate(!favorited);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("rounded-lg", className)}
      aria-pressed={favorited}
      aria-label={
        favorited
          ? `Remove ${clinicName} from favorites`
          : `Save ${clinicName} to favorites`
      }
      onClick={onClick}
    >
      <Heart
        aria-hidden
        className={cn(
          "size-4 transition-colors",
          favorited && "fill-primary text-primary",
        )}
      />
    </Button>
  );
}
