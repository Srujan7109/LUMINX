// src/App.js
import React from "react";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import LiveMeetRoom from "./pages/LiveMeetRoom"; // ✅ Import the new page

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/student-dashboard" element={<StudentDashboard />} />
      <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
      {/* ✅ Route for Live Meet */}
      <Route path="/live-meet" element={<LiveMeetRoom />} />
    </Routes>
  );
}

export default App;
