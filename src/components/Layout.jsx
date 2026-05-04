import React from "react";
import Navbar from "./Navbar";
import { Navigate } from "react-router-dom";

const Layout = ({ children }) => {
  const username = sessionStorage.getItem("username");
  const role = sessionStorage.getItem("role");

  if (!username) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="app-layout">
      <Navbar user={{ username, role }} />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
};

export default Layout;