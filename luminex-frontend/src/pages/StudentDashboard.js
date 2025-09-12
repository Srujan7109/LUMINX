import React, { useState } from "react";
import Navbar from "../components/Navbar.js";
import { useNavigate, useLocation } from "react-router-dom";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./StudentDashboard.css";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date());
  const location = useLocation();
  const { username, role } = location.state || {}; // 👈 receive data

  return (
    <>
      <Navbar role="student" />
      <div className="dashboard-container">
        <h1 className="dashboard-title">
          Welcome {username}! 🎓
          <p>You are logged in as: {role}</p>
        </h1>

        {/* ✅ Calendar Section */}
        <div className="calendar-container">
          <h2>📅 Calendar</h2>
          <Calendar onChange={setDate} value={date} />
          <p>
            <strong>Selected Date:</strong> {date.toDateString()}
          </p>
        </div>

        {/* ✅ Subjects Section */}
        <div className="subjects-grid">
          <div className="subject-card math">Mathematics</div>
          <div className="subject-card science">Science</div>
          <div className="subject-card english">English</div>
          <div className="subject-card history">History</div>
          <div className="subject-card cs">Computer Science</div>

          <div
            className="subject-card join-class"
            onClick={() =>
              navigate("/live-meet", {
                state: { username: username || "Student", role: "student" },
              })
            }
          >
            ➕ Join Class
          </div>
        </div>
      </div>
    </>
  );
}
