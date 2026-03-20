export const OWNER_ADMIN_EMAIL = "contato1jhowzin@gmail.com";

type MaybeUser = {
  cargo?: string;
  email?: string;
} | null | undefined;

export function isOwnerAdmin(user: MaybeUser): boolean {
  if (!user) return false;
  return user.cargo === "admin" && String(user.email || "").toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase();
}

export function isRestrictedStoreAdmin(user: MaybeUser): boolean {
  if (!user) return false;
  return user.cargo === "admin" && !isOwnerAdmin(user);
}
