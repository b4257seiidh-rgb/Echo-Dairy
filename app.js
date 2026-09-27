const STORAGE_KEY = 'echodiary.memories.v1';
const PREFS_KEY = 'echodiary.preferences.v1';
const state = {
  entries: loadJson(STORAGE_KEY, []),
  prefs: loadJson(PREFS_KEY, { dark: false, style: 'natural' }),
  answers: [],
  questionCount: 0,
  currentEntryId: null,
  activeView: 'today',
  calendarDate: new Date(),
  searchQuery: '',
  filter: 'all',
  busy: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  updateCounts();
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatDate(key) {
  return dateFormatter.format(new Date(`${key}T12:00:00`));
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2300);
}

function updateCounts() {
  $('#entry-count').textContent = state.entries.length;
  const favoriteCount = state.entries.filter(entry => entry.favorite).length;
  $('.favorite-count').textContent = favoriteCount;
  $('.favorite-count').hidden = favoriteCount === 0;
  $('.filter-favorite-count').textContent = favoriteCount;
}

function setView(name) {
  state.activeView = name;
  $$('.view-panel').forEach(panel => {
    const active = panel.dataset.panel === name;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === name));
  $('#topbar-context').textContent = name.toUpperCase();
  if (name === 'timeline') renderEntries();
  if (name === 'calendar') renderCalendar();
  if (name === 'memories') renderFavorites();
}

function addMessage(text, type) {
  const stream = $('#chat-stream');
  const row = document.createElement('div');
  row.className = `message-row ${type === 'user' ? 'user-row' : 'ai-row'}`;
  let completion = Promise.resolve();
  if (type === 'user') {
    row.innerHTML = `<div class="mini-avatar">E</div><div class="message-content"><span class="speaker-label">YOU <span class="message-time">JUST NOW</span></span><div class="bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div></div>`;
  } else {
    row.innerHTML = `<div class="mini-avatar">e</div><div class="message-content"><span class="speaker-label">ECHO <span class="message-time">JUST NOW</span></span><div class="bubble ai-bubble"></div></div>`;
    completion = typeText($('.bubble', row), text);
  }
  stream.append(row);
  stream.scrollTop = stream.scrollHeight;
  return completion;
}

function showTyping() {
  const stream = $('#chat-stream');
  const row = document.createElement('div');
  row.className = 'message-row ai-row typing-row';
  row.innerHTML = '<div class="mini-avatar">e</div><div class="message-content"><span class="speaker-label">ECHO</span><div class="typing-dots"><i></i><i></i><i></i></div></div>';
  stream.append(row);
  stream.scrollTop = stream.scrollHeight;
  return row;
}

function typeText(element, text) {
  return new Promise(resolve => {
    let index = 0;
    if (!text.length) {
      resolve();
      return;
    }
    const timer = setInterval(() => {
      element.textContent = text.slice(0, index + 1);
      index += 1;
      const stream = $('#chat-stream');
      stream.scrollTop = stream.scrollHeight;
      if (index >= text.length) {
        clearInterval(timer);
        resolve();
      }
    }, 14);
  });
}

function detectTopics(text) {
  const value = text.toLowerCase();
  return {
    work: /\b(college|class|school|work|office|meeting|lecture|practical|exam|study|teacher|project)\b/.test(value),
    people: /\b(friend|friends|mom|mum|mother|dad|father|sister|brother|family|roommate|partner|they|we)\b/.test(value),
    emotion: /\b(happy|sad|tired|anxious|nervous|excited|angry|calm|proud|lonely|stressed|okay|good|bad|relieved|grateful)\b/.test(value),
    event: /\b(funny|unexpected|surprise|happened|moment|incident|laugh|laughed|beautiful|weird|strange|story)\b/.test(value),
    food: /\b(lunch|dinner|breakfast|ate|food|coffee|tea|snack|cooked|restaurant)\b/.test(value),
    travel: /\b(bus|train|walk|walked|travel|trip|ride|drive|commute|home)\b/.test(value),
    learn: /\b(learned|learnt|realized|realised|understood|lesson|figured out)\b/.test(value),
    lowDetail: value.trim().split(/\s+/).length < 8
  };
}

function chooseNextQuestion(answer, count) {
  const topics = detectTopics(answer);
  const allText = state.answers.join(' ').toLowerCase();
  if (count === 1) {
    if (topics.work) return 'What part of college or work has stayed with you most?';
    if (topics.people) return 'You mentioned people who were part of your day. What did being with them feel like?';
    if (topics.emotion) return 'What do you think was behind that feeling?';
    if (topics.event) return 'What made that moment stand out to you?';
    if (topics.lowDetail) return 'Was there one small moment that made today feel like your day?';
    return 'What happened next that you would want to remember?';
  }
  if (count === 2) {
    if (topics.event && !/\b(friend|people|name)\b/.test(allText)) return 'Who was there with you, if anyone?';
    if (topics.work && !/\b(friend|family|lunch|dinner|evening|home)\b/.test(allText)) return 'How did the rest of the day feel after that?';
    if (topics.emotion && !/\b(learned|learnt|realized|realised|proud|relieved|grateful)\b/.test(allText)) return 'Is there anything you learned or want to carry with you from today?';
    if (topics.food && !/\b(friend|family|evening|night|home)\b/.test(allText)) return 'What was the best part of the day after that?';
    return 'Before we wrap up, how are you feeling now compared with earlier?';
  }
  if (count === 3 && !/\b(remember|keep|learn|realiz|grateful|proud|happy|tired|sad|calm|relieved|today was)\b/.test(allText)) {
    return 'Is there one thing from today you especially want to keep?';
  }
  return null;
}

function updateSuggestions() {
  const suggestions = $('#suggestions');
  const options = state.questionCount === 0
    ? ['A slow morning', 'Something unexpected', "I'm not sure yet"]
    : ['The people in it', 'How it felt', 'One small detail'];
  suggestions.innerHTML = options.map(option => `<button class="suggestion-chip" type="button">${escapeHtml(option)}</button>`).join('');
  $$('.suggestion-chip', suggestions).forEach(button => button.addEventListener('click', () => {
    const input = $('#message-input');
    input.value = button.textContent === "I'm not sure yet" ? 'I am not sure yet. It was a pretty ordinary day.' : `${button.textContent}. `;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    if (button.textContent === "I'm not sure yet") $('#chat-form').requestSubmit();
  }));
}

function updateTimeline() {
  const groups = { MORNING: [], AFTERNOON: [], EVENING: [], NIGHT: [] };
  state.answers.forEach(answer => {
    const text = answer.toLowerCase();
    const matched = [];
    if (/\b(morning|breakfast|sunrise)\b/.test(text)) matched.push('MORNING');
    if (/\b(afternoon|lunch|noon)\b/.test(text)) matched.push('AFTERNOON');
    if (/\b(evening|sunset|dusk|dinner)\b/.test(text)) matched.push('EVENING');
    if (/\b(night|tonight|bedtime)\b/.test(text)) matched.push('NIGHT');
    matched.forEach(period => groups[period].push(answer));
  });
  const slots = $$('.timeline-slot');
  slots.forEach((slot, index) => {
    const key = Object.keys(groups)[index];
    const content = groups[key];
    const copy = $('.period-copy', slot);
    slot.classList.toggle('has-memory', content.length > 0);
    slot.classList.toggle('is-current', content.length === 0 && !slots.slice(0, index).some(previous => previous.classList.contains('has-memory')));
    if (content.length) copy.textContent = content.join(' ').slice(0, 69) + (content.join(' ').length > 69 ? '…' : '');
    else copy.textContent = ['Still taking shape.', 'Left open for now.', 'Waiting if it arrives.', 'Nothing added here.'][index];
  });
}

function finishConversation() {
  if (!state.answers.length) return;
  const entry = buildEntry(state.answers, 'natural');
  const existing = state.entries.findIndex(item => item.date === entry.date);
  if (existing >= 0) {
    entry.favorite = state.entries[existing].favorite;
    state.entries[existing] = entry;
  } else {
    state.entries.unshift(entry);
  }
  saveEntries();
  addMessage('I have enough to hold onto the shape of today. I made you a first draft, and you can change its voice whenever you like.', 'ai');
  const finish = document.createElement('div');
  finish.className = 'finish-memory';
  finish.innerHTML = '<button class="primary-button open-today-entry">Read today\'s memory <span>→</span></button>';
  $('#chat-stream').append(finish);
  $('.open-today-entry', finish).addEventListener('click', () => openEntry(entry.id));
  $('#message-input').disabled = true;
  $('.send-button').disabled = true;
  $('.suggestion-row').innerHTML = '';
  updateTimeline();
  showToast('Today is safely kept on this device.');
}

function submitAnswer(value) {
  const answer = value.trim();
  if (!answer || state.busy || $('#message-input').disabled) return;
  state.answers.push(answer);
  state.questionCount += 1;
  addMessage(answer, 'user');
  $('#message-input').value = '';
  $('#message-input').style.height = '38px';
  updateTimeline();
  const question = chooseNextQuestion(answer, state.questionCount);
  if (!question) {
    finishConversation();
    return;
  }
  state.busy = true;
  const typing = showTyping();
  setTimeout(() => {
    typing.remove();
    addMessage(question, 'ai').then(() => { state.busy = false; });
    updateSuggestions();
  }, 650 + Math.min(question.length * 9, 500));
}

function inferMood(answers) {
  const text = answers.join(' ').toLowerCase();
  const moods = [
    ['Happy', /\b(happy|happier|happiest|joyful|laughed|laughing|excited|fun|funny|good|great|wonderful|love|proud|grateful)\b/],
    ['Tired', /\b(tired|exhausted|sleepy|drained|late|rushed|long day)\b/],
    ['Sad', /\b(sad|lonely|hurt|miss|upset|disappointed|cry|down)\b/],
    ['Anxious', /\b(anxious|nervous|worried|stress|stressed|overwhelmed|panic)\b/],
    ['Calm', /\b(calm|peaceful|quiet|rested|relaxed|slow)\b/]
  ];
  const found = moods.filter(([, pattern]) => pattern.test(text)).map(([mood]) => mood);
  if (found.length > 1) return 'Mixed';
  return found[0] || 'Neutral';
}

function findPeople(answers) {
  const ignored = new Set(['I', 'It', 'Today', 'This', 'That', 'The', 'We', 'My', 'He', 'She', 'They', 'Then', 'After', 'Before', 'When', 'What', 'College', 'Work', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  const people = new Set();
  answers.forEach(answer => {
    const words = answer.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    words.forEach(word => { if (!ignored.has(word)) people.add(word); });
  });
  return [...people].slice(0, 6);
}

function makeTitle(answers) {
  const text = answers.join(' ').toLowerCase();
  if (/\b(funny|laughed|laughing|joke)\b/.test(text)) return 'The moment we couldn’t stop laughing';
  if (/\b(practical|college|class|lecture|school)\b/.test(text)) return 'An unexpected day at college';
  if (/\b(friend|friends|family|mom|dad|sister|brother)\b/.test(text)) return 'The people who made today';
  if (/\b(rain|walk|sunset|sky|light)\b/.test(text)) return 'A small moment to keep';
  if (/\b(tired|late|rushed|long day)\b/.test(text)) return 'A day that found its own pace';
  if (/\b(proud|achieved|finished|finally|managed)\b/.test(text)) return 'A little something I did';
  return 'The shape of an ordinary day';
}

function buildReflection(answers, mood) {
  const firstMood = inferMood([answers[0]]);
  const lastMood = inferMood([answers[answers.length - 1]]);
  const eventAnswer = answers.find(answer => /\b(funny|unexpected|moment|incident|laughed|surprise|happened)\b/i.test(answer));
  if (firstMood !== lastMood && firstMood !== 'Neutral' && lastMood !== 'Neutral') {
    return `You began the day describing yourself as ${firstMood.toLowerCase()}, and by the end you were feeling ${lastMood.toLowerCase()}. That change is part of today's story.`;
  }
  if (eventAnswer) return `You came back to this moment: “${eventAnswer.slice(0, 170)}${eventAnswer.length > 170 ? '…' : ''}” It sounds like this is one you want to keep.`;
  if (answers.length > 1) return `You shared ${answers.length} parts of today with me. Together, they make a picture of a day that felt ${mood.toLowerCase()} to you.`;
  return `You took a moment to notice today as it was. That, too, is worth remembering.`;
}

function buildEntry(answers, style) {
  const mood = inferMood(answers);
  const joined = answers.join('\n\n');
  const people = findPeople(answers);
  const learned = answers.find(answer => /\b(learned|learnt|realized|realised|understood|lesson|figured out)\b/i.test(answer));
  const memorable = answers.find(answer => /\b(funny|unexpected|moment|incident|laugh|surprise|remember|beautiful|proud)\b/i.test(answer));
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: todayKey(),
    title: makeTitle(answers),
    story: styleStory(joined, style),
    originalStory: joined,
    mood,
    people,
    learned: learned || '',
    memorable: memorable || '',
    reflection: buildReflection(answers, mood),
    answers,
    style,
    favorite: false,
    createdAt: new Date().toISOString()
  };
}

function styleStory(text, style) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  if (style === 'minimal') return text;
  if (style === 'emotional') return paragraphs.map((paragraph, index) => index === 0 ? `I remember the start of today: ${paragraph}` : paragraph).join('\n\n');
  if (style === 'cinematic') return paragraphs.map((paragraph, index) => index === 0 ? `The first scene of the day: ${paragraph}` : paragraph).join('\n\n');
  if (style === 'funny') return paragraphs.map((paragraph, index) => index === 0 ? `Today's episode: ${paragraph}` : paragraph).join('\n\n');
  if (style === 'reflective') return paragraphs.map((paragraph, index) => index === 0 ? `Looking back, the day began with: ${paragraph}` : paragraph).join('\n\n');
  return text;
}

function renderEntries() {
  const query = state.searchQuery.trim().toLowerCase();
  const entries = state.entries.filter(entry => {
    if (state.filter === 'favorites' && !entry.favorite) return false;
    return !query || [entry.title, entry.story, entry.date, entry.mood, ...(entry.people || []), entry.learned, entry.memorable].join(' ').toLowerCase().includes(query);
  });
  renderEntryList($('#timeline-entries'), entries, 'No days found', 'Try another search, or start a new memory.');
}

function renderFavorites() {
  const query = state.searchQuery.trim().toLowerCase();
  const entries = state.entries.filter(entry => entry.favorite && (!query || [entry.title, entry.story, entry.date, entry.mood, ...(entry.people || [])].join(' ').toLowerCase().includes(query)));
  renderEntryList($('#favorite-entries'), entries, 'Your favorites will find a home here', 'Tap the little heart on any entry you want to keep close.');
}

function renderEntryList(root, entries, title, message) {
  root.innerHTML = '';
  if (!entries.length) {
    root.innerHTML = `<div class="empty-state"><span>✳</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
    return;
  }
  entries.sort((a, b) => b.date.localeCompare(a.date)).forEach((entry, index) => {
    const card = document.createElement('article');
    card.className = 'entry-card';
    card.style.animationDelay = `${Math.min(index * 45, 270)}ms`;
    card.tabIndex = 0;
    card.innerHTML = `<span class="card-date">${escapeHtml(formatDate(entry.date).toUpperCase())}</span><button class="card-heart ${entry.favorite ? 'is-favorite' : ''}" aria-label="${entry.favorite ? 'Remove favorite' : 'Add favorite'}">${entry.favorite ? '♥' : '♡'}</button><h2 class="card-title">${escapeHtml(entry.title)}</h2><p class="card-excerpt">${escapeHtml(entry.story)}</p><div class="card-bottom"><span class="mood-tag">${escapeHtml(entry.mood)}</span><span class="card-moments">${entry.people?.length ? `${entry.people.length} ${entry.people.length === 1 ? 'person' : 'people'} remembered` : 'A day in your words'}</span></div>`;
    card.addEventListener('click', event => { if (!event.target.closest('.card-heart')) openEntry(entry.id); });
    card.addEventListener('keydown', event => { if (event.key === 'Enter') openEntry(entry.id); });
    $('.card-heart', card).addEventListener('click', event => { event.stopPropagation(); toggleFavorite(entry.id); renderEntries(); renderFavorites(); });
    root.append(card);
  });
}

function openEntry(id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;
  state.currentEntryId = id;
  const overlay = $('#entry-overlay');
  $('.entry-date', overlay).textContent = formatDate(entry.date).toUpperCase();
  $('.entry-title', overlay).textContent = entry.title;
  $('.entry-mood', overlay).textContent = `MOOD · ${entry.mood.toUpperCase()}`;
  $('.entry-story', overlay).textContent = entry.story;
  $('.entry-reflection p', overlay).textContent = entry.reflection;
  $('.favorite-entry', overlay).textContent = entry.favorite ? '♥' : '♡';
  $('.favorite-entry', overlay).classList.toggle('is-favorite', entry.favorite);
  $('#style-select').value = entry.style || 'natural';
  const learned = entry.learned || 'Nothing specific noted today.';
  const memorable = entry.memorable || 'A detail from the day, kept in your own words.';
  const people = entry.people?.length ? entry.people.join(', ') : 'No one named';
  $('.entry-details', overlay).innerHTML = `<div class="detail-block"><span>IMPORTANT MOMENTS</span><p>${escapeHtml(memorable)}</p></div><div class="detail-block"><span>PEOPLE MENTIONED</span><p>${escapeHtml(people)}</p></div><div class="detail-block"><span>THINGS LEARNED</span><p>${escapeHtml(learned)}</p></div><div class="detail-block"><span>MEMORABLE MOMENT</span><p>${escapeHtml(memorable)}</p></div>`;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeEntry() {
  $('#entry-overlay').hidden = true;
  document.body.style.overflow = '';
}

function toggleFavorite(id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;
  entry.favorite = !entry.favorite;
  saveEntries();
  showToast(entry.favorite ? 'A favorite memory, kept close.' : 'Removed from favorites.');
  if (state.currentEntryId === id && !$('#entry-overlay').hidden) openEntry(id);
}

function renderCalendar() {
  const date = state.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  $('#calendar-month-label').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const cells = [];
  ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach(day => cells.push(`<div class="calendar-day-name">${day}</div>`));
  for (let index = 0; index < 42; index += 1) {
    let day, cellDate, muted = false;
    if (index < startOffset) { day = previousMonthDays - startOffset + index + 1; cellDate = new Date(year, month - 1, day); muted = true; }
    else if (index >= startOffset + daysInMonth) { day = index - startOffset - daysInMonth + 1; cellDate = new Date(year, month + 1, day); muted = true; }
    else { day = index - startOffset + 1; cellDate = new Date(year, month, day); }
    const key = todayKey(cellDate);
    const entry = state.entries.find(item => item.date === key);
    const today = key === todayKey();
    cells.push(`<button class="calendar-day ${muted ? 'muted' : ''} ${today ? 'today' : ''} ${entry ? 'has-entry' : ''}" data-date="${key}" ${entry ? `data-entry="${entry.id}"` : ''} aria-label="${escapeHtml(formatDate(key))}${entry ? ', diary entry saved' : ''}">${day}</button>`);
  }
  $('#calendar-grid').innerHTML = cells.join('');
  $$('.calendar-day[data-entry]').forEach(button => button.addEventListener('click', () => openEntry(button.dataset.entry)));
  $$('.calendar-day:not([data-entry])').forEach(button => button.addEventListener('click', () => {
    const selected = new Date(`${button.dataset.date}T12:00:00`);
    if (selected > new Date()) return;
    if (button.classList.contains('muted')) state.calendarDate = selected;
    renderCalendar();
    showToast(`No memory saved for ${shortDateFormatter.format(selected)}.`);
  }));
  const monthEntries = state.entries.filter(entry => entry.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  $('#month-entry-count').textContent = monthEntries.length;
  const moods = [...new Set(monthEntries.map(entry => entry.mood))];
  $('#month-moods').innerHTML = moods.map(mood => `<span>${escapeHtml(mood)}</span>`).join('');
}

function startNewMemory() {
  state.answers = [];
  state.questionCount = 0;
  state.busy = false;
  $('#chat-stream').innerHTML = '<div class="conversation-intro"><span class="intro-kicker">A MOMENT FOR YOU</span><p>Some days are made of big things. Others are made of the way the light fell on your walk home. Either way, it belongs here.</p></div><div class="message-row ai-row"><div class="mini-avatar">e</div><div class="message-content"><span class="speaker-label">ECHO <span class="message-time">JUST NOW</span></span><div class="bubble ai-bubble">How did your day begin?</div></div></div>';
  $('#message-input').disabled = false;
  $('#message-input').value = '';
  $('.send-button').disabled = false;
  updateSuggestions();
  updateTimeline();
  setView('today');
  $('#message-input').focus();
}

function init() {
  if (state.prefs.dark) document.body.classList.add('dark-mode');
  $('#today-date-label').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
  updateCounts();
  updateTimeline();
  updateSuggestions();

  $$('.nav-item').forEach(item => item.addEventListener('click', () => setView(item.dataset.view)));
  $$('.new-entry-button').forEach(button => button.addEventListener('click', startNewMemory));
  $('#chat-form').addEventListener('submit', event => { event.preventDefault(); submitAnswer($('#message-input').value); });
  $('#message-input').addEventListener('input', event => { event.target.style.height = '38px'; event.target.style.height = `${Math.min(event.target.scrollHeight, 95)}px`; });
  $('#message-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#chat-form').requestSubmit(); } });
  $('.theme-toggle').addEventListener('click', () => { state.prefs.dark = !state.prefs.dark; document.body.classList.toggle('dark-mode', state.prefs.dark); savePrefs(); });
  $('.close-entry').addEventListener('click', closeEntry);
  $('#entry-overlay').addEventListener('click', event => { if (event.target.id === 'entry-overlay') closeEntry(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeEntry(); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); const input = $(`[data-panel="${state.activeView}"] .entry-search`); input?.focus(); } });
  $('.favorite-entry').addEventListener('click', () => toggleFavorite(state.currentEntryId));
  $('.regenerate-button').addEventListener('click', () => {
    const entry = state.entries.find(item => item.id === state.currentEntryId);
    if (!entry) return;
    entry.style = $('#style-select').value;
    entry.story = styleStory(entry.originalStory, entry.style);
    saveEntries();
    openEntry(entry.id);
    showToast(`Rewritten in a ${entry.style} voice.`);
  });
  $$('.entry-search').forEach(input => input.addEventListener('input', () => {
    state.searchQuery = input.value;
    $$('.entry-search').forEach(other => { if (other !== input) other.value = input.value; });
    if (state.activeView === 'timeline') renderEntries();
    if (state.activeView === 'memories') renderFavorites();
  }));
  $$('.filter-button').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    $$('.filter-button').forEach(item => item.classList.toggle('active', item === button));
    renderEntries();
  }));
  $$('.calendar-arrow').forEach(button => button.addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + Number(button.dataset.calendarShift));
    renderCalendar();
  }));
}

init();
