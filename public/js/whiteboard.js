// Minimal whiteboard that syncs over Socket.IO without Yjs
(function () {
  let canvas, ctx;
  let isDrawing = false;
  let currentTool = "brush";
  let currentColor = "#000000";
  let currentSize = 3;
  let lastX = 0,
    lastY = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function resizeCanvas() {
    const container = $("whiteboardContainer");
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentSize;
    }
  }

  function isActive() {
    const whiteboardContainer = document.getElementById("whiteboardContainer");
    return (
      whiteboardContainer && !whiteboardContainer.classList.contains("hidden")
    );
  }

  function setWhiteboardActive(active) {
    const slideArea = document.getElementById("slideArea");
    const whiteboardContainer = document.getElementById("whiteboardContainer");
    const whiteboardToggle = document.getElementById("whiteboardToggle");
    const whiteboardControls = document.getElementById("whiteboardControls");
    if (!slideArea || !whiteboardContainer || !whiteboardToggle) return;

    const currentlyActive = isActive();
    if (active === currentlyActive) {
      // Still ensure canvas size
      if (active) setTimeout(resizeCanvas, 50);
      return;
    }

    if (active) {
      slideArea.classList.add("whiteboard-mode");
      whiteboardContainer.classList.remove("hidden");
      whiteboardToggle.classList.add("active");
      whiteboardToggle.textContent = "📋 Slides";
      if (
        window.currentUser &&
        window.currentUser.role === "teacher" &&
        whiteboardControls
      ) {
        whiteboardControls.classList.remove("hidden");
        const canvasEl = document.getElementById("whiteboardCanvas");
        canvasEl && canvasEl.classList.remove("readonly");
      }
      setTimeout(() => {
        resizeCanvas();
        initWhiteboard();
      }, 50);
    } else {
      slideArea.classList.remove("whiteboard-mode");
      whiteboardContainer.classList.add("hidden");
      whiteboardToggle.classList.remove("active");
      whiteboardToggle.textContent = "🎨 Whiteboard";
    }
  }

  function startDrawing(e) {
    if (!window.currentUser || window.currentUser.role !== "teacher") return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    lastY = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
  }

  function draw(e) {
    if (
      !isDrawing ||
      !window.currentUser ||
      window.currentUser.role !== "teacher"
    )
      return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;

    ctx.save();
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.globalCompositeOperation =
      currentTool === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();

    // emit update to students
    if (window.socket) {
      window.socket.emit("whiteboard-update", {
        update: {
          type: "line",
          startX: lastX,
          startY: lastY,
          endX: x,
          endY: y,
          color: currentColor,
          size: currentSize,
          tool: currentTool,
          timestamp: Date.now(),
        },
      });
    }

    lastX = x;
    lastY = y;
  }

  function stopDrawing() {
    isDrawing = false;
  }

  function handleRemoteUpdate(data) {
    if (!data) return;
    const d = data.update || data;
    if (!ctx || !d) return;
    if (Array.isArray(d)) return; // ignore Yjs payloads
    if (d.type === "line") {
      ctx.save();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.size;
      ctx.globalCompositeOperation =
        d.tool === "eraser" ? "destination-out" : "source-over";
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function bindControls() {
    const brush = $("brushTool");
    const eraser = $("eraserTool");
    const color = $("colorPicker");
    const size = $("sizeSlider");
    const clearBtn = $("clearBoard");
    brush &&
      brush.addEventListener("click", () => {
        currentTool = "brush";
        canvas.style.cursor = "crosshair";
      });
    eraser &&
      eraser.addEventListener("click", () => {
        currentTool = "eraser";
        canvas.style.cursor = "grab";
      });
    color &&
      color.addEventListener("change", (e) => {
        currentColor = e.target.value;
        if (ctx) ctx.strokeStyle = currentColor;
      });
    size &&
      size.addEventListener("input", (e) => {
        currentSize = parseInt(e.target.value || "3", 10);
        if (ctx) ctx.lineWidth = currentSize;
      });
    clearBtn &&
      clearBtn.addEventListener("click", () => {
        if (!window.currentUser || window.currentUser.role !== "teacher")
          return;
        ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.socket && window.socket.emit("whiteboard-clear");
      });
  }

  function initWhiteboard() {
    canvas = $("whiteboardCanvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // mouse
    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseout", stopDrawing);
    // touch
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      startDrawing(e);
    });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      draw(e);
    });
    canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      stopDrawing();
    });

    bindControls();

    if (window.socket) {
      window.socket.on("whiteboard-update", handleRemoteUpdate);
      window.socket.on("whiteboard-clear", () => {
        ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
    }
  }

  // Expose minimal API
  window.initializeWhiteboard = initWhiteboard;
  // Toggle uses idempotent setter and emits desired state
  window.toggleWhiteboard = function () {
    const next = !isActive();
    setWhiteboardActive(next);
    if (window.socket)
      window.socket.emit("whiteboard-toggle", { active: next });
  };
  // Apply server broadcasts idempotently (prevents double-toggle)
  window.handleWhiteboardToggle = function (data) {
    if (!data) return;
    setWhiteboardActive(!!data.active);
  };
})();
