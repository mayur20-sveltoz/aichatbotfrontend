// import React, { useEffect, useState } from "react";
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";

const Users = () => {
  const [users, setUsers] = useState([]);
  const [passwords, setPasswords] = useState({});
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "User" });
  const [addLoading, setAddLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState("");

  const API = `${API_BASE_URL}/api/AdminAPI`;

  // const loadUsers = async () => {
  //   try {
  //     const token = sessionStorage.getItem("token");

  //     const res = await axios.get(`${API}/Users`, {
  //       headers: {
  //         Authorization: `Bearer ${token}`
  //       }
  //     });

  //     setUsers(res.data);
  //   } catch (err) {
  //     console.error("Failed to load users", err.response || err);
  //   }
  // };
  const loadUsers = useCallback(async () => {
  try {
    const token = sessionStorage.getItem("token");

    const res = await axios.get(`${API}/Users`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    setUsers(res.data);
  } catch (err) {
    console.error("Failed to load users", err.response || err);
  }
}, [API]);

  // useEffect(() => { loadUsers(); }, []);
  useEffect(() => {
  loadUsers();
}, [loadUsers]);

  // Activate user
  const activateUser = async (id) => {
    await axios.post(`${API}/activate/${id}`, {}, {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`
      }
    });
    setMessageText("User activated successfully");
    setShowMessageModal(true);
    loadUsers();
  };

  // Deactivate user
  const deactivateUser = async (id) => {
    await axios.post(`${API}/deactivate/${id}`, {}, {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`
      }
    });
    setMessageText("User deactivated successfully");
    setShowMessageModal(true);
    loadUsers();
  };

  // Handle password input
  const handlePasswordChange = (id, value) => {
    setPasswords({ ...passwords, [id]: value });
  };

  // Reset password
  const resetPassword = async (id) => {
    const password = passwords[id];
    if (!password) { alert("Enter password first"); return; }

    await axios.post(
      `${API}/reset-password`,
      { id, password },
      {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`
        }
      }
    );
    setMessageText("Password reset successful");
    setShowMessageModal(true);
    setPasswords({ ...passwords, [id]: "" });
  };

  // Add user
  const addUser = async (e) => {
    e.preventDefault();
    setAddLoading(true);

    try {
      const payload = {
        Username: newUser.username,
        Password: newUser.password,
        Role: newUser.role
      };

      const res = await axios.post(
        `${API}/add-user`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`
          }
        }
      );

      console.log("User Added:", res.data);

      setMessageText("User added successfully");
      setShowMessageModal(true);

      // reset form
      setNewUser({
        username: "",
        password: "",
        role: "User"
      });

      setShowAddPanel(false);

      // reload user list
      await loadUsers();

    } catch (err) {
      console.error("Add user error:", err.response?.data || err);
      setMessageText(err.response?.data?.message || "Failed to add user");
      setShowMessageModal(true);
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="users-page">
      {/* Header */}
      <div className="users-header">
        <div>
          <h1>User Management</h1>
          <p>Manage all users, roles, and access</p>
        </div>
        <button
          className="users-add-btn"
          onClick={() => setShowAddPanel(!showAddPanel)}
          style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580" }}
        >
          {showAddPanel ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Cancel
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add User
            </>
          )}
        </button>
      </div>

      {/* Add User Panel */}
      <div className={`users-add-panel ${showAddPanel ? "users-add-panel-open" : ""}`}>
        <div className="users-add-panel-inner">
          <div className="users-add-panel-header">
            <div className="users-add-panel-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h3>Create New User</h3>
          </div>
          <form className="users-add-form" onSubmit={addUser}>
            <div className="users-add-form-grid">
              <div className="users-form-field">
                <label>Username</label>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  required
                />
              </div>
              <div className="users-form-field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                />
              </div>
              <div className="users-form-field">
                <label>Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="Admin">Admin</option>
                  <option value="Technician">Technician</option>
                </select>
              </div>
            </div>
            <div className="users-add-form-actions">
              <button type="button" className="users-add-cancel" onClick={() => setShowAddPanel(false)} style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580" }}>Cancel</button>
              <button type="submit" className="users-add-submit" disabled={addLoading} style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580" }}>
                {addLoading ? (
                  <><span className="btn-spinner"></span> Adding...</>
                ) : (
                  <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg> Create User</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Users Table */}
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Activate / Deactivate</th>
              <th>Reset Password</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="6" className="users-empty">No users found</td></tr>
            ) : (
              users.map((u, i) => (
                <tr key={u.id || i}>
                  <td>{i + 1}</td>
                  <td>
                    <div className="users-cell-user">
                      <div className="users-avatar">{(u.username || "?")[0].toUpperCase()}</div>
                      {u.username}
                    </div>
                  </td>
                  <td>
                    <span className={`users-badge users-badge-${(u.role || "user").toLowerCase()}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`users-status ${u.isActive ? "users-status-active" : "users-status-inactive"}`}>
                      <span className="users-status-dot"></span>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {u.isActive ? (
                      <button className="users-action-btn users-action-deactivate" onClick={() => deactivateUser(u.id)} style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64A9 9 0 0 1 20.77 15" /><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                        Deactivate
                      </button>
                    ) : (
                      <button className="users-action-btn users-action-activate" onClick={() => activateUser(u.id)} style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        Activate
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="users-reset-inline">
                      <input
                        type="password"
                        placeholder="New Password"
                        value={passwords[u.id] || ""}
                        onChange={(e) => handlePasswordChange(u.id, e.target.value)}
                      />
                      <button className="users-action-btn users-action-reset" onClick={() => resetPassword(u.id)} style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ Message Popup Overlay */}
      {showMessageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "400px",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border-light)",
              animation: "fadeIn 0.2s ease-out"
            }}
          >
            <div style={{
              width: "48px",
              height: "48px",
              backgroundColor: "rgba(224, 101, 128, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E06580" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>

            <h3 style={{ margin: "0 0 0.5rem", color: "#fff", fontSize: "1.25rem", fontWeight: "600" }}>Notification</h3>

            <p style={{
              margin: "0 0 2rem",
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "var(--text-secondary)"
            }}>
              {messageText}
            </p>

            <button
              onClick={() => setShowMessageModal(false)}
              style={{
                width: "100%",
                padding: "10px 24px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#E06580",
                color: "#fff",
                fontWeight: "600",
                fontSize: "1rem",
                cursor: "pointer",
                transition: "transform 0.2s, background-color 0.2s",
                boxShadow: "0 4px 12px rgba(224, 101, 128, 0.3)"
              }}
              onMouseOver={(e) => e.target.style.transform = "translateY(-1px)"}
              onMouseOut={(e) => e.target.style.transform = "translateY(0)"}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;