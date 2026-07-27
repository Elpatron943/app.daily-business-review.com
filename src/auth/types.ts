export type AppRole = "admin" | "user";

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  manager_id: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
};

export function isAppRole(v: unknown): v is AppRole {
  return v === "admin" || v === "user";
}

export const roleLabel: Record<AppRole, string> = {
  admin: "Admin",
  user: "Commercial",
};
