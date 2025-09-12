import React from "react";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import LiveMeetRoom from "./pages/LiveMeetRoom";
import AiHelp from "./pages/AiHelp"; // 👈 Import AiHelp

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/student-dashboard" element={<StudentDashboard />} />
      <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
      <Route path="/live-meet" element={<LiveMeetRoom />} />
      <Route path="/ai-help" element={<AiHelp />} /> {/* 👈 New route */}
    </Routes>
  );
}

export default App;
