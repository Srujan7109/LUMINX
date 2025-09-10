import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const Login = () => {
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      alert("Please fill in all fields");
      return;
    }
    role === "teacher"
      ? navigate("/teacher-dashboard")
      : navigate("/student-dashboard");
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-icon">🎓</div>
        <h2 className="login-title">Welcome Back!</h2>
        <p className="login-subtitle">Sign in to continue learning</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
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
