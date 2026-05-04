import React, { useState } from "react";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";
import BBLogo from "../assets/BBizLogo1.png";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  const login = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/AuthAPI/Login`,
        {
          Username: username,
          Password: password
        },
        {
          headers: {
            "Content-Type": "application/json"
          },
          withCredentials: true
        }
      );
      sessionStorage.setItem("username", res.data.username);
      sessionStorage.setItem("role", res.data.role);
      if (res.data.token) {
        sessionStorage.setItem("token", res.data.token);
      }

      if (res.data.role === "Admin") {
        window.location.href = "/dashboard";
      } else {
        window.location.href = "/chatbot";
      }
    } catch (err) {
      console.log(err);
      setError(
        err.response?.data?.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1"></div>
      <div className="login-orb login-orb-2"></div>
      <div className="login-orb login-orb-3"></div>

      <form className="login-card" onSubmit={login}>
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo">
            {/* <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg> */}
            <img src={BBLogo} alt="SmartAI Logo" className="logo-img" />
          </div>
          <h1>SmartAI</h1>
          <p>Sign in to your account</p>
        </div>

        {/* Error message */}
        {error && <div className="login-error">{error}</div>}

        {/* Username */}
        <div className="login-field">
          <label htmlFor="login-username">Username</label>
          <div className="login-input-wrap">
            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <input
              id="login-username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="login-field">
          <label htmlFor="login-password">Password</label>
          <div className="login-input-wrap">
            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="login-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="login-btn"
          disabled={loading}
        >
          {loading ? (
            <span className="login-spinner"></span>
          ) : (
            "Sign In"
          )}
        </button>
      </form>
    </div>
  );
};

export default Login;