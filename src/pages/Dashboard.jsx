import React from "react";
import { useNavigate, Navigate } from "react-router-dom";


const Dashboard = () => {
  const username = sessionStorage.getItem("username");
  const role = sessionStorage.getItem("role");
  const navigate = useNavigate();
  // 🔒 Protect dashboard (only admin allowed)
  if (role !== "Admin") {
    return <Navigate to="/chatbot" />;
  }
  const stats = [
    {
      title: "Welcome Back",
      value: username || "Admin",
      subtitle: `Role: ${role || "N/A"}`,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      color: "purple",
    },
    {
      title: "System Status",
      value: "Online",
      subtitle: "All services running",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      color: "green",
    },
    {
      title: "Quick Actions",
      value: "Manage",
      subtitle: "Users & Settings",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      color: "blue",
    },
    {
      title: "Uploaded PDFs",
      value: "View All",
      subtitle: "Manage uploaded documents",
      route: "/uploaded-pdfs",   // ✅ route added
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
      color: "blue",
    }
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome to SmartAI Administration Panel</p>
      </div>

      <div className="dashboard-grid">
        {stats.map((stat, index) => (
          <div key={index} className={`dashboard-card dashboard-card-${stat.color}`}
            onClick={() => {
              if (stat.title === "Quick Actions") {
                navigate("/users"); // ✅ redirect
              } else if (stat.title === "Uploaded PDFs") {
                navigate("/uploaded-pdfs"); // ✅ new navigation
              }
            }}

            style={{ cursor: stat.title === "Quick Actions" || stat.title === "Uploaded PDFs" ? "pointer" : "default" }}
          >
            <div className="dashboard-card-icon">{stat.icon}</div>
            <div className="dashboard-card-info">
              <span className="dashboard-card-title">{stat.title}</span>
              <span className="dashboard-card-value">{stat.value}</span>
              <span className="dashboard-card-subtitle">{stat.subtitle}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
