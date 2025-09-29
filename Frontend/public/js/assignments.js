// Assignments feature client logic
(function () {
  const state = {
    subject: "Mathematics",
    assignments: [],
    initialized: false,
  };

  function $(sel) {
    return document.querySelector(sel);
  }
  function $all(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  function isTeacher() {
    const role = (window.userRole || "").toString().trim().toLowerCase();
    return role === "teacher";
  }

  function show(el) {
    if (el) el.style.display = "";
  }
  function hide(el) {
    if (el) el.style.display = "none";
  }

  async function fetchAssignments() {
    const res = await fetch(
      `/api/assignments/${encodeURIComponent(state.subject)}`
    );
    const data = await res.json();
    state.assignments = data.assignments || [];
    renderAssignments();
  }

  function renderAssignments() {
    const list = $("#assignments-list");
    if (!list) return;
    list.innerHTML = "";
    if (!state.assignments.length) {
      list.innerHTML = '<div class="text-muted">No assignments yet.</div>';
      return;
    }
    state.assignments.forEach((a) => {
      const card = document.createElement("div");
      card.className = "assignment-card";
      card.innerHTML = `
        <div class="assignment-header">
          <div>
            <div class="assignment-title">${escapeHtml(a.title)}</div>
            <div class="assignment-meta">Subject: ${escapeHtml(a.subject)}${
        a.dueDate ? ` • Due: ${new Date(a.dueDate).toLocaleDateString()}` : ""
      }</div>
          </div>
          ${
            a.attachmentUrl
              ? `<a class="btn btn-sm btn-outline-primary" href="${a.attachmentUrl}" target="_blank">View Attachment</a>`
              : ""
          }
        </div>
        <div class="assignment-desc">${escapeHtml(a.description || "")}</div>
        <div class="assignment-actions">
          ${
            isTeacher()
              ? `<button class="btn btn-sm btn-secondary" data-view-subs="${
                  a.id
                }">View Submissions (${(a.submissions || []).length})</button>`
              : `<button class="btn btn-sm btn-primary" data-submit="${a.id}">Submit Work</button>`
          }
        </div>
      `;
      list.appendChild(card);
    });

    // Bind actions
    $all("[data-submit]").forEach((btn) =>
      btn.addEventListener("click", () =>
        openSubmitModal(btn.getAttribute("data-submit"))
      )
    );
    $all("[data-view-subs]").forEach((btn) =>
      btn.addEventListener("click", () =>
        openSubmissionsModal(btn.getAttribute("data-view-subs"))
      )
    );
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // Submit Work Modal
  function openSubmitModal(assignmentId) {
    const modal = $("#submitModal");
    if (!modal) return;
    modal.dataset.assignmentId = assignmentId;
    modal.querySelector("form").reset();
    show(modal);
  }

  async function handleSubmitWork(e) {
    e.preventDefault();
    const modal = $("#submitModal");
    const assignmentId = modal?.dataset?.assignmentId;
    const fileInput = modal.querySelector('input[type="file"]');
    const username =
      new URLSearchParams(location.search).get("username") ||
      window.userName ||
      "student";
    if (!fileInput.files[0]) return alert("Please select a file");
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    fd.append("studentUsername", username);
    fd.append("studentName", window.userName || "Anonymous Student");
    const res = await fetch(`/api/assignments/${assignmentId}/submit`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return alert("Upload failed");
    hide(modal);
    await fetchAssignments();
    window.showNotification && window.showNotification("Submission uploaded");
  }

  // View Submissions Modal (Teacher)
  function openSubmissionsModal(assignmentId) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    const modal = $("#submissionsModal");
    if (!a || !modal) return;
    modal.dataset.assignmentId = assignmentId;
    const list = modal.querySelector(".subs-list");
    list.innerHTML = "";
    if (!a.submissions?.length) {
      list.innerHTML = '<div class="text-muted">No submissions yet.</div>';
    } else {
      a.submissions.forEach((s) => {
        const row = document.createElement("div");
        row.className = "submission-row";
        row.innerHTML = `
          <div class="left">
            <div class="student">${escapeHtml(s.studentUsername)}${
          s.studentName ? ` (${escapeHtml(s.studentName)})` : ""
        }</div>
            <a href="${s.fileUrl}" target="_blank" class="link">View file</a>
          </div>
          <div class="right">
            <div class="grade">${
              s.grade != null ? `Grade: ${s.grade}` : "Ungraded"
            }</div>
            <div class="feedback">${
              s.feedback ? escapeHtml(s.feedback) : ""
            }</div>
            <div class="actions">
              <button class="btn btn-sm btn-outline-success" data-ai-grade="${
                s.id
              }">Get AI Suggestion</button>
              <button class="btn btn-sm btn-outline-primary" data-manual-grade="${
                s.id
              }">Grade</button>
            </div>
          </div>
        `;
        list.appendChild(row);
      });
    }
    show(modal);

    // Bind buttons
    $all("[data-ai-grade]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const subId = btn.getAttribute("data-ai-grade");
        const data = await aiGrade(assignmentId, subId);
        if (data && data.ai) {
          openGradeModal(assignmentId, subId);
          setTimeout(() => {
            const gm = document.getElementById("gradeModal");
            if (!gm) return;
            const gradeInput = gm.querySelector('input[name="grade"]');
            const feedbackInput = gm.querySelector('textarea[name="feedback"]');
            if (gradeInput && data.ai.suggestedGrade != null)
              gradeInput.value = data.ai.suggestedGrade;
            if (feedbackInput && data.ai.feedback)
              feedbackInput.value = data.ai.feedback;
          }, 0);
          window.showNotification &&
            window.showNotification("AI suggestion applied");
        }
      })
    );
    $all("[data-manual-grade]").forEach((btn) =>
      btn.addEventListener("click", () =>
        openGradeModal(assignmentId, btn.getAttribute("data-manual-grade"))
      )
    );
  }

  async function aiGrade(assignmentId, submissionId) {
    const res = await fetch(`/api/assignments/${assignmentId}/ai-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    });
    if (!res.ok) {
      alert("AI grading failed");
      return null;
    }
    const data = await res.json();
    window.showNotification && window.showNotification("AI grade completed");
    await fetchAssignments();
    openSubmissionsModal(assignmentId);
    return data;
  }

  function openCreateModal() {
    const modal = $("#createModal");
    if (!modal) return;
    modal.querySelector("form").reset();
    show(modal);
  }

  async function handleCreateAssignment(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    fd.append("subject", state.subject);
    const res = await fetch("/api/assignments", { method: "POST", body: fd });
    if (!res.ok) return alert("Failed to create assignment");
    hide($("#createModal"));
    await fetchAssignments();
    window.showNotification && window.showNotification("Assignment created");
  }

  function openAIModal() {
    const modal = $("#aiCreateModal");
    if (!modal) return;
    modal.querySelector("form").reset();
    show(modal);
  }

  async function handleAICreate(e) {
    e.preventDefault();
    const topic = e.target.querySelector('input[name="topic"]').value.trim();
    if (!topic) return alert("Enter a topic");
    const res = await fetch("/api/generate-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, subject: state.subject }),
    });
    if (!res.ok) return alert("AI generation failed");
    hide($("#aiCreateModal"));
    await fetchAssignments();
    window.showNotification && window.showNotification("AI assignment created");
  }

  function openGradeModal(assignmentId, submissionId) {
    const modal = $("#gradeModal");
    if (!modal) return;
    modal.dataset.assignmentId = assignmentId;
    modal.dataset.submissionId = submissionId;
    modal.querySelector("form").reset();
    show(modal);
  }

  async function handleManualGrade(e) {
    e.preventDefault();
    const modal = $("#gradeModal");
    const assignmentId = modal.dataset.assignmentId;
    const submissionId = modal.dataset.submissionId;
    const grade = modal.querySelector('input[name="grade"]').value;
    const feedback = modal.querySelector('textarea[name="feedback"]').value;
    const res = await fetch(`/api/assignments/${assignmentId}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, grade, feedback }),
    });
    if (!res.ok) return alert("Failed to update grade");
    hide(modal);
    await fetchAssignments();
    openSubmissionsModal(assignmentId);
  }

  function bindUI() {
    const tabs = $all("[data-subject]");
    tabs.forEach((tab) =>
      tab.addEventListener("click", () => {
        state.subject = tab.getAttribute("data-subject");
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        fetchAssignments();
      })
    );

    const createBtn = $("#btnCreate");
    const aiBtn = $("#btnAICreate");
    if (createBtn) createBtn.addEventListener("click", openCreateModal);
    if (aiBtn) aiBtn.addEventListener("click", openAIModal);

    const createForm = $("#createModal form");
    const submitForm = $("#submitModal form");
    const aiForm = $("#aiCreateModal form");
    const gradeForm = $("#gradeModal form");
    if (createForm)
      createForm.addEventListener("submit", handleCreateAssignment);
    if (submitForm) submitForm.addEventListener("submit", handleSubmitWork);
    if (aiForm) aiForm.addEventListener("submit", handleAICreate);
    if (gradeForm) gradeForm.addEventListener("submit", handleManualGrade);

    // Close buttons
    $all(".assignments-modal [data-close]").forEach((btn) =>
      btn.addEventListener("click", () =>
        hide(btn.closest(".assignments-modal"))
      )
    );

    // Role-based controls
    const teacherButtons = document.getElementById("teacher-action-buttons");
    if (teacherButtons)
      teacherButtons.style.display = isTeacher() ? "flex" : "none";
  }

  window.initAssignments = function initAssignments() {
    if (!state.initialized) {
      bindUI();
      state.initialized = true;
    }
    // Ensure teacher buttons reflect current role each time we init
    const teacherButtons = document.getElementById("teacher-action-buttons");
    if (teacherButtons)
      teacherButtons.style.display = isTeacher() ? "flex" : "none";
    fetchAssignments();
  };
})();
