// src/pages/TeacherDashboard.js
import React from "react";
import Navbar from "../components/Navbar";
import { useNavigate, useLocation } from "react-router-dom"; // ✅ Import navigation hook
import "./StudentDashboard.css";

export default function TeacherDashboard() {
  const navigate = useNavigate(); // ✅ Initialize it here
  const location = useLocation();
  const { username, role } = location.state || {};

  return (
    <>
      <Navbar role="teacher" /> {/* ✅ Role should be teacher, not student */}
      <div className="dashboard-container">
        <h1 className="dashboard-title">
          Welcome , {username}! 🎓
          <p>You are logged in as: {role}</p>
        </h1>

        <div className="subjects-grid">
          <div className="subject-card math">Mathematics</div>
          <div className="subject-card science">Science</div>
          <div className="subject-card english">English</div>
          <div className="subject-card history">History</div>
          <div className="subject-card cs">Computer Science</div>

          {/* Join Class navigates to LiveMeetRoom */}
          <div
            className="subject-card join-class"
            onClick={() =>
              navigate("/live-meet", {
                state: { username: username || "Teacher", role: "teacher" },
              })
            }
          >
            ➕ Start Class
          </div>
        </div>
      </div>
    </>
  );
}
