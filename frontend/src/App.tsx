import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const LocationPage = lazy(() => import("./pages/LocationPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const ScenarioPage = lazy(() => import("./pages/ScenarioPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));

const navigation = [
  { to: "/", label: "Overview", icon: "◫", end: true },
  { to: "/map", label: "Heat map", icon: "⌖" },
  { to: "/locations", label: "Locations", icon: "◎" },
  { to: "/scenarios", label: "Cooling scenarios", icon: "⌁" },
  { to: "/insights", label: "Insights & reports", icon: "↗" },
];

function ComingSoon({ title }: { title: string }) {
  return (
    <main className="content">
      <div className="placeholder-page">
        <p className="eyebrow">DELHI · URBAN HEAT INTELLIGENCE</p>
        <h1>{title}</h1>
        <p>This view is being built on the same verified observation and model services.</p>
        <NavLink className="text-link" to="/">Return to overview <span>→</span></NavLink>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="brand-name">URBIVUE</p>
            <p className="brand-subtitle">URBAN HEAT INTELLIGENCE</p>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="city-selector">
          <span className="city-pin">●</span>
          <span><strong>Delhi, India</strong><small>National Capital Territory</small></span>
          <span className="city-chevron">⌄</span>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <p className="nav-section-label">ANALYZE</p>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.to === "/map" && <span className="nav-new">DATA</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="data-status"><span className="status-dot" /><span><strong>Data connected</strong><small>Observed records available</small></span></div>
          <div className="profile-row"><div className="profile-avatar">VT</div><div><strong>Delhi project</strong><small>Research workspace</small></div><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Delhi</strong></div>
          <div className="topbar-right"><span className="live-indicator"><i /> DATA CONNECTED</span><button className="help-button" type="button" aria-label="Help">?</button></div>
        </header>
        <Suspense fallback={<main className="content"><div className="skeleton heading-skeleton" /><div className="skeleton map-loading" /></main>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/locations" element={<LocationPage />} />
            <Route path="/scenarios" element={<ScenarioPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="*" element={<ComingSoon title="Page not found" />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
