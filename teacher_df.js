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

function updateDoubt(id, updates) {
  const doubts = getDoubts();
  const idx = doubts.findIndex(d => d.id === id);
  if (idx === -1) return;
  doubts[idx] = { ...doubts[idx], ...updates };
  saveDoubts(doubts);
  renderAll();
}

function renderCard(d) {
  const card = document.createElement('div');
  card.className = 'doubt-card bg-white p-6 rounded-xl shadow-md border border-gray-200 new-doubt';

  let responseHtml = '';
  if (d.response) {
    responseHtml = `
      <div class="teacher-response-area mt-4 pt-4 border-t border-gray-200">
        <p class="text-sm text-gray-600 font-medium mb-2">Teacher's Response:</p>
        <p class="text-gray-800 bg-gray-100 p-3 rounded-md">${escapeHtml(d.response)}</p>
      </div>`;
  } else {
    responseHtml = `
      <div class="teacher-response-area mt-4 pt-4 border-t border-gray-200">
        <textarea class="response-input w-full p-2 border border-gray-300 rounded-md mb-2" rows="2" placeholder="Type your response..."></textarea>
        <div class="flex justify-end gap-2">
          ${d.visibility === 'anonymous' ? `
            <label class="flex items-center text-sm">
              <input type="checkbox" class="publish-checkbox mr-2"> Publish to Public Forum
            </label>
          ` : ''}
          <button data-id="${d.id}" class="submit-btn bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700">Submit</button>
        </div>
      </div>`;
  }

  card.innerHTML = `
    <div class="flex justify-between items-start">
      <span class="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">${escapeHtml(d.subject)}</span>
      <span class="text-xs text-gray-500">${escapeHtml(d.visibility)}</span>
    </div>
    <p class="my-4 text-gray-700">${escapeHtml(d.text)}</p>
    ${responseHtml}
  `;

  // Hook up submit button
  const btn = card.querySelector('.submit-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const responseInput = card.querySelector('.response-input');
      const publishCheckbox = card.querySelector('.publish-checkbox');
      const resp = responseInput.value.trim();
      if (!resp) {
        alert('Please enter a response.');
        return;
      }
      const updates = {
        response: resp,
        respondedAt: new Date().toISOString()
      };
      if (d.visibility === 'anonymous' && publishCheckbox && publishCheckbox.checked) {
        updates.visibility = 'public';
      }
      updateDoubt(d.id, updates);
    });
  }

  return card;
}

function renderAll() {
  const publicContainer = document.getElementById('publicDoubts');
  const anonContainer = document.getElementById('anonymousDoubts');

  const doubts = getDoubts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  publicContainer.innerHTML = '';
  anonContainer.innerHTML = '';

  doubts.forEach(d => {
    const card = renderCard(d);
    if (d.visibility === 'public') {
      publicContainer.appendChild(card);
    } else {
      anonContainer.appendChild(card);
    }
  });

  if (!publicContainer.children.length) {
    publicContainer.innerHTML = `<p class="text-center text-gray-500">No public doubts yet.</p>`;
  }
  if (!anonContainer.children.length) {
    anonContainer.innerHTML = `<p class="text-center text-gray-500">No anonymous doubts in inbox.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) renderAll();
  });
});
