# low-bandwidth

# LUMINEX Project

## Overview
This project is a web application aimed at enhancing the virtual classroom experience.  
The focus of this branch is on improving the **UI/UX**, adding a **Student Progress Tracker**, and integrating a **Chatbot**.

## Updates in this Branch
- **UI Changes**:
  - Redesigned **Classroom** page for a cleaner and more intuitive layout.
  - Updated **Dashboard** page for a more professional and chic look.
  - Improved **Login Page** design for better usability.

- **New Features**:
  - Added **Student Progress Tracker** (hard-coded data) to monitor student assignments and grades.
  - Integrated **Chatbot** powered by Ollama’s local LLM for answering student queries.

## Notes
- This branch primarily focuses on **frontend improvements** with basic AI integration.
- No backend database functionality has been added or changed in this branch.

---

## Prerequisites
- **Node.js** and **npm** installed
- **Ollama** installed for running the local AI model

---

## How to Run

1. **Clone the repository**
   ```bash
   git clone https://github.com/Srujan7109/LUMINEX.git
   cd LUMINEX
2. **Install dependencies**
   ```bash
   npm install
3. **Install Ollama**
4. **Pull the required model (Mistral 7B Instruct, quantized)**
   ```bash
   ollama pull mistral:7b-instruct-q4_0
5. **Start the Ollama server (in a separate terminal)**
   ```bash
   ollama serve
5. **Start the Node.js backend**
   ```bash
   node server.js
