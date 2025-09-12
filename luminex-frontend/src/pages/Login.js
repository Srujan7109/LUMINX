import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const Login = () => {
  const [role, setRole] = useState("student");
  const [username, setUsername] = useState(""); // ✅ added username
  const [password, setPassword] = useState(""); // optional for prototype
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username || !password) {
      alert("Please fill in all fields");
      return;
    }

    const userData = { role, username };

    role === "teacher"
      ? navigate("/teacher-dashboard", { state: userData })
      : navigate("/student-dashboard", { state: userData });
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-icon">🎓</div>
        <h2 className="login-title">Welcome Back!</h2>
        <p className="login-subtitle">Sign in to continue learning</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>Username</label>
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter any password (prototype only)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label>Login as</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">👩‍🎓 Student</option>
            <option value="teacher">👨‍🏫 Teacher</option>
          </select>

          <button type="submit" className="login-btn">
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
