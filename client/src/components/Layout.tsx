import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          AdvChecklists
        </Link>
        {user && (
          <div className="app-header-right">
            <span>{user.name}</span>
            <button className="link" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
