import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <Link to="/" className="brand">
            AdvChecklists
          </Link>
          {user && (
            <nav className="app-tabs">
              <NavLink to="/" end className={({ isActive }) => (isActive ? "app-tab active" : "app-tab")}>
                Templates
              </NavLink>
              <NavLink to="/in-progress" className={({ isActive }) => (isActive ? "app-tab active" : "app-tab")}>
                In progress
              </NavLink>
            </nav>
          )}
        </div>
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
