import type { User } from "@supabase/supabase-js";

/** Human-readable label for the signed-in user. */
export function getUserDisplayName(user: User | null | undefined): string {
  if (!user) return "Guest";

  const metadataName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined);

  if (metadataName?.trim()) {
    return metadataName.trim();
  }

  if (user.email) {
    const localPart = user.email.split("@")[0];
    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "User";
}

/** One or two initials for avatars. */
export function getUserInitials(user: User | null | undefined): string {
  const name = getUserDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}
