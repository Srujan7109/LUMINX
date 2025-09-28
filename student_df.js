const STORAGE_KEY = 'doubts_db_v1';

function escapeHtml(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}

function getDoubts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDoubts(doubts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doubts));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function renderPublicDoubts() {
  const container = document.getElementById('publicDoubts');
  const doubts = getDoubts().filter(d => d.visibility === 'public')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.innerHTML = '';
  if (doubts.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-500">No public doubts yet.</p>`;
    return;
  }

  doubts.forEach(d => {
    const card = document.createElement('div');
    card.className = 'doubt-card bg-white p-6 rounded-xl shadow-md border border-gray-200 new-doubt';

    const responseHtml = d.response
      ? `<div class="teacher-response-area mt-4 pt-4 border-t border-gray-200">
           <p class="text-sm text-gray-600 font-medium mb-2">Teacher's Response:</p>
           <p class="text-gray-800 bg-gray-100 p-3 rounded-md">${escapeHtml(d.response)}</p>
         </div>`
      : `<div class="teacher-response-area mt-4 pt-4 border-t border-gray-200">
           <p class="text-sm text-gray-500 italic">No response yet.</p>
         </div>`;

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <span class="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">${escapeHtml(d.subject)}</span>
        <span class="text-xs text-gray-500">${escapeHtml(d.visibility)}</span>
      </div>
      <p class="my-4 text-gray-700">${escapeHtml(d.text)}</p>
      ${responseHtml}
    `;

    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const doubtForm = document.getElementById('doubtForm');
  const doubtText = document.getElementById('doubtText');
  const subjectEl = document.getElementById('subject');
  const errorMessage = document.getElementById('error-message');

  renderPublicDoubts();

  doubtForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = doubtText.value.trim();
    if (!text) {
      errorMessage.classList.remove('hidden');
      return;
    }
    errorMessage.classList.add('hidden');

    const visibility = document.querySelector('input[name="visibility"]:checked').value;
    const doubts = getDoubts();
    doubts.push({
      id: generateId(),
      subject: subjectEl.value,
      text,
      visibility,
      response: null,
      createdAt: new Date().toISOString()
    });
    saveDoubts(doubts);

    if (visibility === 'anonymous') {
      alert('✅ Anonymous doubt submitted. Teachers will see it in their inbox.');
    }

    doubtForm.reset();
    renderPublicDoubts();
  });

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) renderPublicDoubts();
  });
});
