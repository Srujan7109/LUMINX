import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Navbar.css";

const Navbar = ({ role = "student" }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    alert("Logged out successfully!");
    navigate("/");
  };

  return (
    <nav className={`navbar-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Collapse / Expand Button */}
      <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? "➡️" : "⬅️"}
      </button>

      {/* Logo / App Name */}
      <div className="navbar-logo">📘 {!collapsed && "Luminex"}</div>

      {/* Navigation Links */}
      <ul className="navbar-links">
        <li>
          <Link
            to={
              role === "teacher" ? "/teacher-dashboard" : "/student-dashboard"
            }
          >
            {collapsed ? "🏠" : "Home"}
          </Link>
        </li>
        <li>
          <Link to="/offline-materials">
            {collapsed ? "📂" : "Offline Materials"}
          </Link>
        </li>
        <li>
          <Link to="/assignments">{collapsed ? "📝" : "Assignments"}</Link>
        </li>
        <li>
          <Link to="/quizzes">{collapsed ? "❓" : "Quizzes / Puzzles"}</Link>
        </li>
        <li>
          <Link to="/profile">{collapsed ? "👤" : "Profile"}</Link>
        </li>
        <li>
          <Link to="/profile">{collapsed ? "❓" : "Ai Help"}</Link>
        </li>
      </ul>

      {/* Logout Button */}
      <button onClick={handleLogout} className="navbar-logout">
        {collapsed ? "🚪" : "Logout"}
      </button>
    </nav>
  );
};

export default Navbar;
