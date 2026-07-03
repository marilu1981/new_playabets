/**
 * Admin - User Access Management page.
 * Only accessible to users with role === 'admin'.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "../components/DashboardLayout";
import { usePermissions } from "../contexts/PermissionsContext";
import { adminApi, type AdminUser } from "../lib/api";
import { Trash2, Save, Plus, UserPlus, RefreshCw, Shield, Eye } from "lucide-react";

// Short display labels for each dashboard route
const PAGE_LABELS: Record<string, string> = {
  "/": "Home",
  "/users": "Players",
  "/betting": "Betting",
  "/transactions": "Transactions",
  "/casino": "Casino",
  "/crm": "CRM",
  "/vip": "VIP",
  "/product": "Product",
  "/acquisition": "Acquisition",
};

type EditableUser = AdminUser & { dirty: boolean };

const EMPTY_NEW_USER = {
  user_email: "",
  role: "viewer" as "admin" | "viewer",
  allowed_pages: ["*"] as string[],
};

function PagePill({
  path,
  selected,
  onClick,
}: {
  path: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={path}
      className="px-2 py-0.5 rounded text-xs font-medium border transition-colors"
      style={
        selected
          ? { background: "#e8f5cc", color: "#4a7000", borderColor: "#7ab800" }
          : { background: "#f3f4f6", color: "#9ca3af", borderColor: "#e5e7eb" }
      }
    >
      {PAGE_LABELS[path] ?? path}
    </button>
  );
}

function AllBadge({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-0.5 rounded text-xs font-semibold border transition-colors"
      style={{ background: "#7ab800", color: "#fff", borderColor: "#5a8c00" }}
    >
      All pages
    </button>
  );
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const permissions = usePermissions();

  const [users, setUsers] = useState<EditableUser[]>([]);
  const [dashboardPaths, setDashboardPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [addingSaving, setAddingSaving] = useState(false);

  // Redirect non-admins immediately
  useEffect(() => {
    if (permissions.userEmail && permissions.role !== "admin") {
      navigate("/");
    }
  }, [permissions.userEmail, permissions.role, navigate]);

  useEffect(() => {
    if (!permissions.userEmail || permissions.role !== "admin") return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions.userEmail]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listUsers(permissions.userEmail);
      setUsers(data.users.map((u) => ({ ...u, dirty: false })));
      setDashboardPaths(data.dashboard_paths);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // -- Helpers ----------------------------------------------------------------

  function patchUser(email: string, patch: Partial<Omit<EditableUser, "user_email">>) {
    setUsers((prev) =>
      prev.map((u) => (u.user_email === email ? { ...u, ...patch, dirty: true } : u))
    );
  }

  function togglePage(email: string, path: string, currentPages: string[]) {
    let next: string[];
    if (currentPages.includes("*")) {
      next = dashboardPaths.filter((p) => p !== path);
    } else if (currentPages.includes(path)) {
      const reduced = currentPages.filter((p) => p !== path);
      next = reduced.length ? reduced : ["*"];
    } else {
      const added = [...currentPages, path];
      next = dashboardPaths.every((p) => added.includes(p)) ? ["*"] : added;
    }
    patchUser(email, { allowed_pages: next });
  }

  function setAllPages(email: string) {
    patchUser(email, { allowed_pages: ["*"] });
  }

  // -- Save / Delete ----------------------------------------------------------

  async function saveUser(u: EditableUser) {
    setSaving((prev) => ({ ...prev, [u.user_email]: true }));
    try {
      await adminApi.upsertUser(permissions.userEmail, {
        user_email: u.user_email,
        role: u.role,
        allowed_pages: u.allowed_pages,
      });
      setUsers((prev) =>
        prev.map((x) => (x.user_email === u.user_email ? { ...x, dirty: false } : x))
      );
    } catch (e) {
      alert(`Failed to save: ${e}`);
    } finally {
      setSaving((prev) => ({ ...prev, [u.user_email]: false }));
    }
  }

  async function deleteUser(email: string) {
    if (!window.confirm(`Remove ${email} from the permissions list?`)) return;
    try {
      await adminApi.deleteUser(permissions.userEmail, email);
      setUsers((prev) => prev.filter((u) => u.user_email !== email));
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  }

  // -- Add user ---------------------------------------------------------------

  function toggleNewUserPage(path: string) {
    setNewUser((prev) => {
      const cur = prev.allowed_pages;
      let next: string[];
      if (cur.includes("*")) {
        next = dashboardPaths.filter((p) => p !== path);
      } else if (cur.includes(path)) {
        const reduced = cur.filter((p) => p !== path);
        next = reduced.length ? reduced : ["*"];
      } else {
        const added = [...cur, path];
        next = dashboardPaths.every((p) => added.includes(p)) ? ["*"] : added;
      }
      return { ...prev, allowed_pages: next };
    });
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    const email = newUser.user_email.trim().toLowerCase();
    if (!email) return;
    setAddingSaving(true);
    try {
      const saved = await adminApi.upsertUser(permissions.userEmail, {
        user_email: email,
        role: newUser.role,
        allowed_pages: newUser.allowed_pages,
      });
      setUsers((prev) => {
        const exists = prev.some((u) => u.user_email === saved.user_email);
        if (exists) {
          return prev.map((u) =>
            u.user_email === saved.user_email ? { ...saved, dirty: false } : u
          );
        }
        return [...prev, { ...saved, dirty: false }];
      });
      setNewUser(EMPTY_NEW_USER);
    } catch (err) {
      alert(`Failed to add user: ${err}`);
    } finally {
      setAddingSaving(false);
    }
  }

  // -- Render -----------------------------------------------------------------

  if (!permissions.userEmail || permissions.role !== "admin") return null;

  return (
    <DashboardLayout
      title="User Access Management"
      subtitle="Control which dashboard pages each user can access"
    >
      <div className="max-w-5xl mx-auto space-y-6">

        {/* -- Add User ------------------------------------------------------ */}
        <div
          className="rounded-lg border p-5"
          style={{ background: "#fff", borderColor: "#dde8dd" }}
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <UserPlus size={15} style={{ color: "#7ab800" }} />
            Add / Update User
          </h2>

          <form onSubmit={addUser} className="space-y-4">
            {/* Email */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={newUser.user_email}
                  onChange={(e) => setNewUser((p) => ({ ...p, user_email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ borderColor: "#dde8dd" }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser((p) => ({ ...p, role: e.target.value as "admin" | "viewer" }))
                  }
                  className="px-3 py-2 text-sm border rounded-md focus:outline-none"
                  style={{ borderColor: "#dde8dd" }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {/* Page toggles */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-500">Allowed Pages</label>
                <button
                  type="button"
                  onClick={() => setNewUser((p) => ({ ...p, allowed_pages: ["*"] }))}
                  className="text-xs text-green-700 hover:underline"
                >
                  Select all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {newUser.allowed_pages.includes("*") ? (
                  <>
                    <AllBadge onClick={() => setNewUser((p) => ({ ...p, allowed_pages: [] }))} />
                    <span className="text-xs text-gray-400 self-center">click to restrict</span>
                  </>
                ) : (
                  dashboardPaths.map((path) => (
                    <PagePill
                      key={path}
                      path={path}
                      selected={newUser.allowed_pages.includes(path)}
                      onClick={() => toggleNewUserPage(path)}
                    />
                  ))
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={addingSaving || !newUser.user_email.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "#7ab800" }}
            >
              <Plus size={14} />
              {addingSaving ? "Saving..." : "Add User"}
            </button>
          </form>
        </div>

        {/* -- User List ----------------------------------------------------- */}
        <div
          className="rounded-lg border"
          style={{ background: "#fff", borderColor: "#dde8dd" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "#dde8dd" }}
          >
            <h2 className="text-sm font-semibold text-gray-700">
              Configured Users
              {!loading && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({users.length})
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={load}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#7ab800", borderTopColor: "transparent" }} />
              Loading...
            </div>
          )}

          {error && (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          )}

          {!loading && !error && users.length === 0 && (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">
              No users configured yet. Add users above to restrict access, or leave empty to allow all authenticated users full access.
            </div>
          )}

          {!loading && !error && users.length > 0 && (
            <div className="divide-y" style={{ borderColor: "#f0f4f0" }}>
              {users.map((u) => (
                <div key={u.user_email} className="px-5 py-4 space-y-3">
                  {/* Row header */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                        style={{ background: "rgba(122,184,0,0.12)", color: "#7ab800" }}
                      >
                        {u.user_email[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {u.user_email}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Role selector */}
                      <select
                        value={u.role}
                        onChange={(e) =>
                          patchUser(u.user_email, { role: e.target.value as "admin" | "viewer" })
                        }
                        className="text-xs px-2 py-1 border rounded focus:outline-none"
                        style={
                          u.role === "admin"
                            ? { borderColor: "#7ab800", color: "#4a7000", background: "#f0f9e0" }
                            : { borderColor: "#e5e7eb", color: "#6b7280" }
                        }
                      >
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>

                      {/* Role badge */}
                      {u.role === "admin" ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "#7ab800" }}>
                          <Shield size={11} />
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-300">
                          <Eye size={11} />
                        </span>
                      )}

                      {/* Save button */}
                      <button
                        type="button"
                        onClick={() => saveUser(u)}
                        disabled={!u.dirty || saving[u.user_email]}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-white transition-opacity disabled:opacity-30"
                        style={{ background: u.dirty ? "#7ab800" : "#9ca3af" }}
                        title="Save changes"
                      >
                        <Save size={11} />
                        {saving[u.user_email] ? "..." : "Save"}
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => deleteUser(u.user_email)}
                        className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove user"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Page toggles */}
                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {u.allowed_pages.includes("*") ? (
                      <>
                        <AllBadge onClick={() => patchUser(u.user_email, { allowed_pages: dashboardPaths.length ? [dashboardPaths[0]] : [] })} />
                        <span className="text-xs text-gray-400 self-center">all pages - click to restrict</span>
                      </>
                    ) : (
                      <>
                        {dashboardPaths.map((path) => (
                          <PagePill
                            key={path}
                            path={path}
                            selected={u.allowed_pages.includes(path)}
                            onClick={() => togglePage(u.user_email, path, u.allowed_pages)}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => setAllPages(u.user_email)}
                          className="px-2 py-0.5 rounded text-xs border transition-colors text-gray-400 border-dashed border-gray-300 hover:border-green-400 hover:text-green-600"
                        >
                          all
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* -- Info note ----------------------------------------------------- */}
        <p className="text-xs text-gray-400 px-1">
          Users not listed here default to full access. Removing a user from this list restores full access for that account.
          Bootstrap admins configured via the <code className="bg-gray-100 px-1 rounded">ADMIN_EMAILS</code> environment variable always retain admin access regardless of this list.
        </p>
      </div>
    </DashboardLayout>
  );
}
