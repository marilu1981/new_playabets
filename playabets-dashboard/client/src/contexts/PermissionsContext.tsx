/**
 * PermissionsContext - holds the authenticated user's dashboard access rights.
 *
 * Populated by AuthGuard after the Supabase session is confirmed.
 * Components read `usePermissions()` to decide what to render or navigate to.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface UserPermissions {
  userEmail: string;
  role: "admin" | "viewer";
  /** Route paths the user may visit, or ['*'] for all pages. */
  allowedPages: string[];
}

export const defaultPermissions: UserPermissions = {
  userEmail: "",
  role: "viewer",
  allowedPages: ["*"],
};

export const PermissionsContext = createContext<UserPermissions>(defaultPermissions);

export function usePermissions(): UserPermissions {
  return useContext(PermissionsContext);
}

/** Returns true when the user is allowed to visit `path`. */
export function canViewPage(permissions: UserPermissions, path: string): boolean {
  if (permissions.allowedPages.includes("*")) return true;
  return permissions.allowedPages.includes(path);
}

export function PermissionsProvider({
  value,
  children,
}: {
  value: UserPermissions;
  children: ReactNode;
}) {
  // Cache permissions so fallback (if API fails) can restore previous session state
  localStorage.setItem("cachedPermissions", JSON.stringify(value));
  
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}
