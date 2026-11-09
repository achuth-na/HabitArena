import { createClient } from '@supabase/supabase-js';

document.querySelector('#year').textContent = new Date().getFullYear();

const themeToggle = document.querySelector('#theme-toggle');
const brandHomeLink = document.querySelector('#brand-home-link');
const installAppButton = document.querySelector('#install-app-button');
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installAppButton.hidden = false;
});

installAppButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installAppButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installAppButton.hidden = true;
  showToast('HabitArena is installed.');
});

function setTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  window.localStorage.setItem('habitarena-theme', isDark ? 'dark' : 'light');
}
setTheme(window.localStorage.getItem('habitarena-theme') || 'light');
themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

const { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = import.meta.env;
const supabase = VITE_SUPABASE_URL && VITE_SUPABASE_PUBLISHABLE_KEY
  ? createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
  : null;

const homePage = document.querySelector('#home');
const dashboard = document.querySelector('#dashboard');
const habitList = document.querySelector('#habit-list');
const emptyState = document.querySelector('#empty-state');
const dashboardStatus = document.querySelector('#dashboard-status');
const habitDialog = document.querySelector('#habit-dialog');
const habitForm = document.querySelector('#habit-form');
const habitFormStatus = document.querySelector('#habit-form-status');
const roomDialog = document.querySelector('#room-dialog');
const roomForm = document.querySelector('#room-form');
const roomFormStatus = document.querySelector('#room-form-status');
const roomList = document.querySelector('#room-list');
const roomStatus = document.querySelector('#room-status');
const roomStatusDetail = document.querySelector('#room-status-detail');
const roomBoard = document.querySelector('#room-board');
const roomsListPage = document.querySelector('#rooms-list-page');
const profileForm = document.querySelector('#profile-form');
const profileStatus = document.querySelector('#profile-status');
const profileSave = document.querySelector('#profile-save');
const profileButton = document.querySelector('#profile-button');
const howItWorksLink = document.querySelector('#how-it-works-link');
const profileDialog = document.querySelector('#profile-dialog');
const roomEditDialog = document.querySelector('#room-edit-dialog');
const roomEditForm = document.querySelector('#room-edit-form');
const roomEditStatus = document.querySelector('#room-edit-status');
const roomEditChecklist = document.querySelector('#room-edit-checklist');
const appToast = document.querySelector('#app-toast');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmTitle = document.querySelector('#confirm-title');
const confirmMessage = document.querySelector('#confirm-message');
const confirmCancel = document.querySelector('#confirm-cancel');
const confirmClose = document.querySelector('#confirm-close');
const confirmAccept = document.querySelector('#confirm-accept');
let editingRoomItems = [];
let savedProfile = { displayName: '', username: '' };
let currentUser = null;
let isJoiningRoom = false;
let currentRoom = null;
const roomCache = new Map();
let roomLoadGeneration = 0;
let pendingRoomAction = null;
let toastTimer = null;

function showToast(message, kind = 'info') {
  if (!message) return;
  appToast.textContent = message;
  appToast.dataset.kind = kind;
  appToast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { appToast.hidden = true; }, 4500);
}

function askForConfirmation(message, { title = 'Are you sure?', confirmText = 'Continue', destructive = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      confirmDialog.close();
      resolve(confirmed);
    };
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmAccept.textContent = confirmText;
    confirmAccept.className = destructive
      ? 'btn btn-danger rounded-pill px-4'
      : 'btn btn-accent rounded-pill px-4';
    confirmCancel.onclick = () => finish(false);
    confirmClose.onclick = () => finish(false);
    confirmAccept.onclick = () => finish(true);
    confirmDialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    confirmDialog.showModal();
    confirmCancel.focus();
  });
}

function setRoomStatus(message = '') {
  roomStatus.textContent = message;
  roomStatusDetail.textContent = message;
  if (message && !message.startsWith('Loading')) showToast(message, /error|incorrect|failed|cannot|could not/i.test(message) ? 'error' : 'info');
}

function addChecklistInput(container, { value = '', itemId = '', createMode = false } = {}) {
  const row = document.createElement('div');
  row.className = 'checklist-editor-row';
  if (itemId) row.dataset.itemId = itemId;
  const input = document.createElement('input');
  input.className = 'form-control';
  input.type = 'text';
  input.maxLength = 80;
  input.value = value;
  input.placeholder = 'Enter a checklist item';
  input.required = true;
  input.dataset.checklistItem = 'true';
  input.id = createMode && container.childElementCount === 0 ? 'room-create-checklist-0' : '';
  const remove = document.createElement('button');
  remove.className = 'btn btn-outline-danger';
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', 'Remove checklist row');
  remove.addEventListener('click', () => {
    if (container.childElementCount <= 1) {
      input.value = '';
      input.focus();
      return;
    }
    row.remove();
  });
  row.append(input, remove);
  container.append(row);
  input.focus();
}

const authDialog = document.querySelector('#auth-dialog');
const authButton = document.querySelector('[data-action="sign-in"]');
const authTitle = document.querySelector('#auth-title');
const authDescription = document.querySelector('#auth-description');
const authSubmit = document.querySelector('#auth-submit');
const authSwitchLabel = document.querySelector('#auth-switch-label');
const authSwitch = document.querySelector('#auth-switch');
const authSwitchRow = document.querySelector('#auth-switch-row');
const authPasswordLabel = document.querySelector('#auth-password-label');
const authPassword = document.querySelector('#auth-password');
const forgotPassword = document.querySelector('#forgot-password');
const authStatus = document.querySelector('#auth-status');
const displayNameGroup = document.querySelector('#display-name-group');
let isCreatingAccount = false;
let isResettingPassword = false;

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart() {
  const monday = new Date();
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return localDateString(monday);
}

function setSignedInView(session) {
  currentUser = session?.user ?? null;
  const signedIn = Boolean(currentUser);
  homePage.hidden = signedIn;
  dashboard.hidden = !signedIn;
  profileButton.hidden = !signedIn;
  howItWorksLink.hidden = signedIn;
  if (!signedIn) return;
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date());
  loadHabits();
  loadRooms();
  loadProfile();
}

brandHomeLink.addEventListener('click', (event) => {
  if (!currentUser) return;
  event.preventDefault();
  window.history.replaceState({ view: 'rooms' }, '', '#dashboard');
  currentRoom = null;
  roomBoard.hidden = true;
  roomsListPage.hidden = false;
  setRoomStatus('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function applyAuthState(session) {
  const signedIn = Boolean(session?.user);
  authButton.textContent = signedIn ? 'Sign out' : 'Sign in';
  authButton.dataset.action = signedIn ? 'sign-out' : 'sign-in';
  setSignedInView(session);
  window.history.replaceState({ view: signedIn ? 'rooms' : 'home' }, '', signedIn ? '#dashboard' : '#home');
}

function showRoomsPage() {
  currentRoom = null;
  roomBoard.hidden = true;
  roomsListPage.hidden = false;
  roomList.hidden = false;
  setRoomStatus('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('popstate', (event) => {
  if (!currentUser) return;
  if (event.state?.view === 'room') {
    const room = roomCache.get(event.state.roomId);
    if (room) openRoom(room, localToday(), false);
    else showRoomsPage();
    return;
  }
  showRoomsPage();
});

function makeText(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

async function loadHabits() {
  if (!supabase || !currentUser) return;
  dashboardStatus.textContent = 'Loading your habits…';
  const today = localDateString(new Date());
  const [{ data: habits, error: habitsError }, { data: logs, error: logsError }] = await Promise.all([
    supabase.from('habits').select('id, name, target_per_week').order('created_at'),
    supabase.from('habit_completions').select('habit_id, completed_on')
      .gte('completed_on', getWeekStart()).lte('completed_on', today),
  ]);

  if (habitsError || logsError) {
    dashboardStatus.textContent = 'The habits database is not ready yet. We need to run its secure setup in Supabase first.';
    return;
  }

  const weeklyCounts = new Map();
  const completedToday = new Set();
  for (const log of logs ?? []) {
    weeklyCounts.set(log.habit_id, (weeklyCounts.get(log.habit_id) ?? 0) + 1);
    if (log.completed_on === today) completedToday.add(log.habit_id);
  }

  habitList.replaceChildren();
  const habitRows = habits ?? [];
  emptyState.hidden = habitRows.length > 0;
  for (const habit of habitRows) {
    const count = weeklyCounts.get(habit.id) ?? 0;
    const isComplete = completedToday.has(habit.id);
    const cardColumn = document.createElement('div');
    cardColumn.className = 'col-md-6 col-xl-4';
    const card = makeText('article', 'habit-card h-100', '');
    const top = makeText('div', 'd-flex justify-content-between align-items-start gap-2', '');
    const title = makeText('h2', 'h5 fw-bold mb-1', habit.name);
    const target = makeText('span', 'badge rounded-pill text-bg-light', `${habit.target_per_week}× / week`);
    const nameGroup = document.createElement('div');
    nameGroup.append(title, makeText('p', 'small text-secondary mb-0', `${count} of ${habit.target_per_week} this week`));
    top.append(nameGroup, target);
    const progress = makeText('div', 'progress habit-progress mt-3', '');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    const percent = Math.min(100, Math.round((count / habit.target_per_week) * 100));
    progress.setAttribute('aria-valuenow', String(percent));
    const bar = makeText('div', 'progress-bar', '');
    bar.style.width = `${percent}%`;
    progress.append(bar);
    const actions = makeText('div', 'habit-actions mt-4', '');
    const completeButton = makeText('button', `btn rounded-pill px-3 habit-complete${isComplete ? ' is-complete' : ''}`, isComplete ? 'Done today ✓' : 'Mark done today');
    completeButton.type = 'button';
    completeButton.addEventListener('click', () => toggleCompletion(habit.id, isComplete, completeButton));
    const deleteButton = makeText('button', 'habit-delete ms-auto', 'Remove');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => removeHabit(habit));
    actions.append(completeButton, deleteButton);
    card.append(top, progress, actions);
    cardColumn.append(card);
    habitList.append(cardColumn);
  }
  dashboardStatus.textContent = habitRows.length ? '' : 'Your habits are private to your account.';
}

async function toggleCompletion(habitId, isComplete, button) {
  if (!supabase) return;
  const date = localDateString(new Date());
  button.disabled = true;
  dashboardStatus.textContent = 'Saving today’s check-in…';
  const result = isComplete
    ? await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('completed_on', date)
    : await supabase.from('habit_completions').insert({ habit_id: habitId, completed_on: date });
  if (result.error) dashboardStatus.textContent = result.error.message;
  await loadHabits();
}

async function removeHabit(habit) {
  if (!supabase || !await askForConfirmation(`Remove “${habit.name}” and its check-in history?`, {
    title: 'Remove this habit?', confirmText: 'Remove habit', destructive: true,
  })) return;
  dashboardStatus.textContent = 'Removing habit…';
  const { error } = await supabase.from('habits').delete().eq('id', habit.id);
  if (error) {
    dashboardStatus.textContent = error.message;
    return;
  }
  await loadHabits();
}

function showRoomForm(joinRoom) {
  isJoiningRoom = joinRoom;
  roomForm.reset();
  document.querySelector('#room-create-checklist').replaceChildren();
  if (!joinRoom) addChecklistInput(document.querySelector('#room-create-checklist'), { createMode: true });
  roomFormStatus.textContent = '';
  document.querySelector('#room-dialog-title').textContent = joinRoom ? 'Join a room' : 'Create a room';
  document.querySelector('#room-dialog-description').textContent = joinRoom
    ? 'Enter the room name and password shared by the room owner.'
    : 'Give your room a name and password to share with your crew.';
  document.querySelector('#room-name-group').hidden = joinRoom;
  document.querySelector('#room-join-group').hidden = !joinRoom;
  document.querySelector('#room-name').required = !joinRoom;
  document.querySelector('#room-password').required = !joinRoom;
  document.querySelector('#join-room-name').required = joinRoom;
  document.querySelector('#join-room-password').required = joinRoom;
  document.querySelector('#room-submit').textContent = joinRoom ? 'Join room' : 'Create room';
  if (!roomDialog.open) roomDialog.showModal();
  document.querySelector(joinRoom ? '#join-room-name' : '#room-name').focus();
}

document.querySelector('#add-room-checklist-item').addEventListener('click', () => {
  const list = document.querySelector('#room-create-checklist');
  if (list.childElementCount >= 20) {
    roomFormStatus.textContent = 'A room can have up to 20 checklist items.';
    return;
  }
  addChecklistInput(list, { createMode: true });
  roomFormStatus.textContent = '';
});

document.querySelector('#add-checklist-item').addEventListener('click', () => {
  if (roomEditChecklist.childElementCount >= 20) {
    roomEditStatus.textContent = 'A room can have up to 20 checklist items.';
    return;
  }
  addChecklistInput(roomEditChecklist);
  roomEditStatus.textContent = '';
});

async function loadRooms() {
  if (!supabase || !currentUser) return;
  const loadGeneration = ++roomLoadGeneration;
  const userId = currentUser.id;
  const { data, error } = await supabase.from('room_memberships')
    .select('room_id, rooms(id, name)')
    .eq('user_id', userId).order('joined_at', { ascending: true });
  if (loadGeneration !== roomLoadGeneration || currentUser?.id !== userId) return;
  if (error) {
    setRoomStatus('Apply the rooms setup in Supabase to enable competition.');
    return;
  }

  const rooms = new Map();
  for (const membership of data ?? []) {
    const room = Array.isArray(membership.rooms) ? membership.rooms[0] : membership.rooms;
    if (room && !rooms.has(room.id)) rooms.set(room.id, room);
  }
  const roomRows = await Promise.all([...rooms.values()].map(async (room) => {
    const { data: players, error: rosterError } = await supabase.rpc('get_room_roster', { p_room_id: room.id });
    return { room, players, rosterError };
  }));
  if (loadGeneration !== roomLoadGeneration || currentUser?.id !== userId) return;

  setRoomStatus('');
  roomCache.clear();
  roomBoard.hidden = true;
  roomsListPage.hidden = false;
  roomList.hidden = false;
  if (!roomRows.length) {
    roomList.replaceChildren();
    const empty = makeText('p', 'small text-secondary mb-0', 'No rooms yet. Create one or join with its name and password.');
    roomList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const { room, players, rosterError } of roomRows) {
    roomCache.set(room.id, room);
    const roomRow = makeText('button', 'room-row', '');
    roomRow.type = 'button';
    const left = document.createElement('div');
    left.append(makeText('span', 'room-row-title d-block', room.name));
    const participantNames = rosterError ? 'Participants loading…' : (players ?? []).map((player) => player.display_name).join(', ');
    left.append(makeText('span', 'room-row-meta', participantNames || 'You are the first participant'));
    roomRow.append(left);
    roomRow.addEventListener('click', () => openRoom(room));
    fragment.append(roomRow);
  }
  roomList.replaceChildren(fragment);
}

async function loadProfile() {
  if (!supabase || !currentUser) return;
  const nameInput = document.querySelector('#profile-name');
  const usernameInput = document.querySelector('#profile-username');
  const accountDetails = currentUser.user_metadata ?? {};
  const metadataName = accountDetails.display_name ?? '';
  const metadataUsername = (accountDetails.username ?? '').toLowerCase();
  nameInput.value = metadataName;
  usernameInput.value = metadataUsername;
  savedProfile = { displayName: '', username: '' };
  const { data, error } = await supabase.from('profiles').select('display_name, username')
    .eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    profileStatus.textContent = error.message;
    updateProfileSaveState();
    return;
  }
  if (!error && data) {
    nameInput.value = data.display_name || metadataName;
    usernameInput.value = (data.username || metadataUsername).toLowerCase();
    savedProfile = { displayName: data.display_name ?? '', username: (data.username ?? '').toLowerCase() };
  }
  profileStatus.textContent = '';
  updateProfileSaveState();
}

function updateProfileSaveState() {
  const displayName = document.querySelector('#profile-name').value.trim();
  const username = document.querySelector('#profile-username').value.trim().toLowerCase();
  profileSave.disabled = displayName === savedProfile.displayName && username === savedProfile.username;
}

document.querySelector('#profile-name').addEventListener('input', updateProfileSaveState);
document.querySelector('#profile-username').addEventListener('input', updateProfileSaveState);

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return;
  const displayName = document.querySelector('#profile-name').value.trim();
  const username = document.querySelector('#profile-username').value.trim().toLowerCase();
  profileSave.disabled = true;
  profileStatus.textContent = 'Saving…';
  const { error } = await supabase.from('profiles').upsert({ user_id: currentUser.id, display_name: displayName, username });
  profileStatus.textContent = error
    ? (error.code === '23505' ? 'That username is already taken.' : error.message)
    : 'Profile saved';
  if (error) {
    updateProfileSaveState();
    return;
  }
  savedProfile = { displayName, username };
  updateProfileSaveState();
  profileDialog.close();
  await loadRooms();
});

profileButton.addEventListener('click', async () => {
  await loadProfile();
  if (!profileDialog.open) profileDialog.showModal();
});

document.querySelector('#room-back').addEventListener('click', () => {
  if (window.history.state?.view === 'room') window.history.back();
  else showRoomsPage();
});

document.querySelector('#edit-room-button').addEventListener('click', async () => {
  if (!currentRoom || !supabase) return;
  roomEditStatus.textContent = 'Loading room settings…';
  document.querySelector('#edit-room-name').value = currentRoom.name;
  document.querySelector('#edit-room-password').value = '';
  roomEditChecklist.replaceChildren();
  const { data, error } = await supabase.from('room_checklist_items')
    .select('id, label, position').eq('room_id', currentRoom.id).order('position');
  if (error) {
    setRoomStatus(error.message);
    return;
  }
  editingRoomItems = data ?? [];
  for (const item of editingRoomItems) addChecklistInput(roomEditChecklist, { value: item.label, itemId: item.id });
  if (!roomEditChecklist.childElementCount) addChecklistInput(roomEditChecklist);
  roomEditStatus.textContent = '';
  if (!roomEditDialog.open) roomEditDialog.showModal();
});

roomEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentRoom || !supabase) return;
  const rows = [...roomEditChecklist.querySelectorAll('.checklist-editor-row')];
  const items = rows.map((row) => ({ id: row.dataset.itemId || null, label: row.querySelector('input').value.trim() })).filter((item) => item.label);
  if (!items.length || items.length > 20) {
    roomEditStatus.textContent = 'Keep between 1 and 20 checklist items.';
    return;
  }
  const duplicateLabels = new Set(items.map((item) => item.label.toLowerCase()));
  if (duplicateLabels.size !== items.length) {
    roomEditStatus.textContent = 'Each checklist item needs a different name.';
    return;
  }
  roomEditStatus.textContent = 'Saving room…';
  const saveButton = roomEditForm.querySelector('[type="submit"]');
  saveButton.disabled = true;
  const roomName = document.querySelector('#edit-room-name').value.trim();
  const { error: roomError } = await supabase.rpc('update_room_details', { p_room_id: currentRoom.id, p_name: roomName });
  if (roomError) {
    roomEditStatus.textContent = roomError.message;
    saveButton.disabled = false;
    return;
  }
  const removedIds = editingRoomItems.filter((oldItem) => !items.some((item) => item.id === oldItem.id)).map((item) => item.id);
  if (removedIds.length) {
    const { error } = await supabase.from('room_checklist_items').delete().in('id', removedIds);
    if (error) {
      roomEditStatus.textContent = error.message;
      saveButton.disabled = false;
      return;
    }
  }
  for (const [position, item] of items.entries()) {
    const result = item.id
      ? await supabase.from('room_checklist_items').update({ label: item.label, position }).eq('id', item.id)
      : await supabase.from('room_checklist_items').insert({ room_id: currentRoom.id, label: item.label, position });
    if (result.error) {
      roomEditStatus.textContent = result.error.message;
      saveButton.disabled = false;
      return;
    }
  }
  const newPassword = document.querySelector('#edit-room-password').value;
  if (newPassword) {
    const { error } = await supabase.rpc('update_room_password', { p_room_id: currentRoom.id, p_password: newPassword });
    if (error) {
      roomEditStatus.textContent = error.message;
      saveButton.disabled = false;
      return;
    }
  }
  currentRoom = { ...currentRoom, name: roomName };
  roomEditDialog.close();
  saveButton.disabled = false;
  await loadRooms();
  roomsListPage.hidden = true;
  roomBoard.hidden = false;
  document.querySelector('#room-board-title').textContent = roomName;
  await loadRoomDate(document.querySelector('#room-board-date').dataset.isoDate || localToday());
});

document.querySelector('#delete-room-button').addEventListener('click', async () => {
  if (!currentRoom || !supabase || !await askForConfirmation(`Delete “${currentRoom.name}” and its room checklist and check-ins for everyone? This cannot be undone.`, {
    title: 'Delete this room?', confirmText: 'Delete room', destructive: true,
  })) return;
  const { count, error } = await supabase.from('rooms').delete({ count: 'exact' }).eq('id', currentRoom.id);
  if (error) {
    setRoomStatus(error.message);
    return;
  }
  if (!count) {
    const roomName = currentRoom.name;
    await loadRooms();
    setRoomStatus(`“${roomName}” was not deleted. Only the room owner can delete it.`);
    return;
  }
  currentRoom = null;
  roomBoard.hidden = true;
  roomsListPage.hidden = false;
  await loadRooms();
  setRoomStatus('Room deleted.');
});

document.querySelector('#leave-room-button').addEventListener('click', async () => {
  if (!currentRoom || !supabase || !await askForConfirmation(`Leave “${currentRoom.name}”?`, {
    title: 'Leave this room?', confirmText: 'Leave room', destructive: true,
  })) return;
  const { error } = await supabase.from('room_memberships').delete().eq('room_id', currentRoom.id).eq('user_id', currentUser.id);
  if (error) {
    setRoomStatus(error.message);
    return;
  }
  currentRoom = null;
  roomBoard.hidden = true;
  roomsListPage.hidden = false;
  await loadRooms();
  setRoomStatus('You left the room.');
});

roomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return;
  const joining = isJoiningRoom;
  const submitButton = document.querySelector('#room-submit');
  const submittedPassword = joining ? '' : document.querySelector('#room-password').value;
  submitButton.disabled = true;
  roomFormStatus.textContent = joining ? 'Joining…' : 'Creating…';
  const result = joining
    ? await supabase.rpc('join_room_by_name', {
      p_room_name: document.querySelector('#join-room-name').value.trim(),
      p_password: document.querySelector('#join-room-password').value,
    })
    : await supabase.rpc('create_room', {
      p_name: document.querySelector('#room-name').value.trim(),
      p_password: document.querySelector('#room-password').value,
      p_checklist: [...document.querySelectorAll('#room-create-checklist [data-checklist-item]')].map((item) => item.value.trim()).filter(Boolean),
    });
  submitButton.disabled = false;
  if (result.error) {
    roomFormStatus.textContent = result.error.message;
    return;
  }
  roomDialog.close();
  await loadRooms();
  if (joining) setRoomStatus('You joined the room!');
  else setRoomStatus(`Room created. Share the room name “${document.querySelector('#room-name').value.trim()}” and its password with your crew.`);
});

function localToday() { return localDateString(new Date()); }

function shiftDate(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function previousCompletedWeekEnd() {
  const today = new Date();
  const weekday = today.getDay();
  const daysBack = weekday === 0 ? 0 : weekday;
  today.setDate(today.getDate() - daysBack);
  return localDateString(today);
}

function previousCompletedMonthEnd() {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return localDateString(today.getDate() === lastDay
    ? today
    : new Date(today.getFullYear(), today.getMonth(), 0));
}

function drawRoomBoard(rows, players, selectedDate) {
  const table = document.querySelector('#room-board-table');
  table.replaceChildren();
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.append(makeText('th', '', 'Room checklist'));
  for (const player of players) headerRow.append(makeText('th', 'text-center', player.display_name));
  head.append(headerRow);
  table.append(head);
  const body = document.createElement('tbody');
  const grouped = new Map();
  for (const entry of rows) {
    if (!grouped.has(entry.item_id)) grouped.set(entry.item_id, { name: entry.item_name, byPlayer: new Map() });
    grouped.get(entry.item_id).byPlayer.set(entry.user_id, entry);
  }
  for (const habit of grouped.values()) {
    const tr = document.createElement('tr');
    tr.append(makeText('th', 'fw-semibold', habit.name));
    for (const player of players) {
      const entry = habit.byPlayer.get(player.user_id);
      const td = makeText('td', entry?.is_completed ? 'text-center room-cell-done' : 'text-center room-cell-pending', '');
      if (!entry) td.textContent = '—';
      else if (player.user_id === currentUser?.id) {
        const button = makeText('button', `btn btn-sm rounded-pill ${entry.is_completed ? 'habit-complete is-complete' : 'btn-outline-dark'}`, entry.is_completed ? '✓ Done' : 'Mark done');
        button.type = 'button';
        button.addEventListener('click', () => toggleRoomCompletion(entry, selectedDate, button));
        td.append(button);
      } else td.textContent = entry.is_completed ? '✓ Done' : '○ Not yet';
      tr.append(td);
    }
    body.append(tr);
  }
  if (!grouped.size) {
    const tr = document.createElement('tr');
    tr.append(makeText('td', 'text-secondary', 'Add checklist items while creating this room.'));
    body.append(tr);
  }
  table.append(body);
}

function renderDailyStatus(rows, players) {
  const target = document.querySelector('#daily-status-cards');
  target.replaceChildren();
  const itemCount = new Set((rows ?? []).map((entry) => entry.item_id)).size;
  if (!itemCount) {
    target.append(makeText('p', 'small text-secondary mb-0', 'No checklist items are in this room yet.'));
    return;
  }
  for (const player of players) {
    const playerRows = rows.filter((entry) => entry.user_id === player.user_id);
    const completedCount = playerRows.filter((entry) => entry.is_completed).length;
    const percentage = Math.round((completedCount / itemCount) * 100);
    const card = makeText('article', 'daily-status-card', '');
    card.append(makeText('h4', 'h6 fw-bold mb-1', player.display_name));
    card.append(makeText('p', 'small text-secondary mb-2', `${completedCount} of ${itemCount} checklist items done`));
    const progress = makeText('div', 'progress daily-status-progress', '');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', String(percentage));
    progress.setAttribute('aria-label', `${player.display_name} daily progress`);
    const bar = makeText('div', 'progress-bar', '');
    bar.style.width = `${percentage}%`;
    progress.append(bar);
    card.append(progress, makeText('span', 'daily-status-percent small fw-bold', `${percentage}%`));
    target.append(card);
  }
}

async function toggleRoomCompletion(entry, date, button) {
  if (!supabase || !currentUser || entry.user_id !== currentUser.id) return;
  button.disabled = true;
  const result = entry.is_completed
    ? await supabase.from('room_checklist_completions').delete().eq('item_id', entry.item_id).eq('user_id', currentUser.id).eq('completed_on', date)
    : await supabase.from('room_checklist_completions').insert({ item_id: entry.item_id, user_id: currentUser.id, completed_on: date });
  if (result.error) setRoomStatus(result.error.message);
  else setRoomStatus('');
  await loadRoomDate(date);
}

function renderReport(targetId, summaries) {
  const target = document.querySelector(targetId);
  target.replaceChildren();
  for (const summary of summaries) {
    target.append(makeText('p', 'report-line mb-2', `${summary.display_name} (@${summary.username || 'player'}) — ${Number(summary.score).toFixed(0)}% · ${summary.completed_count}/${summary.possible_count} check-ins`));
  }
  if (!summaries.length) target.append(makeText('p', 'small text-secondary mb-0', 'No room members yet.'));
}

async function openRoom(room, selectedDate = localToday(), addHistory = true) {
  if (addHistory) window.history.pushState({ view: 'room', roomId: room.id }, '', `#room/${room.id}`);
  currentRoom = room;
  roomsListPage.hidden = true;
  roomBoard.hidden = false;
  document.querySelector('#room-board-title').textContent = room.name;
  setRoomStatus('Loading room…');
  const { data: players, error: rosterError } = await supabase.rpc('get_room_roster', { p_room_id: room.id });
  if (rosterError) {
    setRoomStatus(rosterError.message);
    return;
  }
  const membership = (players ?? []).find((player) => player.user_id === currentUser.id);
  const isManager = ['owner', 'admin'].includes(membership?.role);
  document.querySelector('#room-management').hidden = !isManager;
  document.querySelector('#delete-room-button').hidden = membership?.role !== 'owner';
  document.querySelector('#leave-room-button').hidden = !membership || membership.role === 'owner';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await loadRoomDate(selectedDate);
}

async function loadRoomDate(selectedDate) {
  if (!currentRoom || !supabase) return;
  const today = localToday();
  const datePicker = document.querySelector('#room-board-date');
  datePicker.dataset.isoDate = selectedDate;
  datePicker.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    .format(new Date(`${selectedDate}T12:00:00`));
  document.querySelector('#room-day-next').disabled = selectedDate >= today;
  document.querySelector('#room-day-previous').onclick = () => loadRoomDate(shiftDate(selectedDate, -1));
  document.querySelector('#room-day-next').onclick = () => loadRoomDate(shiftDate(selectedDate, 1));

  const [{ data: rows, error }, { data: players, error: playersError }] = await Promise.all([
    supabase.rpc('get_room_checkboard', { p_room_id: currentRoom.id, p_on: selectedDate }),
    supabase.rpc('get_room_roster', { p_room_id: currentRoom.id }),
  ]);
  if (error || playersError) {
    setRoomStatus((error ?? playersError).message);
    return;
  }
  setRoomStatus('');
  drawRoomBoard(rows ?? [], players ?? [], selectedDate);
  renderDailyStatus(rows ?? [], players ?? []);

  const weekEnd = previousCompletedWeekEnd();
  const monthEnd = previousCompletedMonthEnd();
  const weekStartDate = shiftDate(weekEnd, -6);
  const monthEndDate = new Date(`${monthEnd}T12:00:00`);
  const monthStart = localDateString(new Date(monthEndDate.getFullYear(), monthEndDate.getMonth(), 1));
  const [{ data: weeklyRows }, { data: monthlyRows }] = await Promise.all([
    supabase.rpc('get_room_summary', { p_room_id: currentRoom.id, p_start: weekStartDate, p_end: weekEnd }),
    supabase.rpc('get_room_summary', { p_room_id: currentRoom.id, p_start: monthStart, p_end: monthEnd }),
  ]);
  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthEndDate);
  document.querySelector('#weekly-report-title').textContent = `Weekly report · ${weekStartDate} – ${weekEnd}`;
  document.querySelector('#monthly-report-title').textContent = `Monthly report · ${monthName}`;
  renderReport('#weekly-report', weeklyRows ?? []);
  renderReport('#monthly-report', monthlyRows ?? []);
  document.querySelector('#room-reports').hidden = false;
}

document.querySelectorAll('[data-action="add-habit"]').forEach((button) => {
  button.addEventListener('click', () => {
    habitForm.reset();
    habitFormStatus.textContent = '';
    if (!habitDialog.open) habitDialog.showModal();
    document.querySelector('#habit-name').focus();
  });
});

habitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return;
  const name = document.querySelector('#habit-name').value.trim();
  const targetPerWeek = Number(document.querySelector('#habit-target').value);
  const saveButton = habitForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  habitFormStatus.textContent = 'Saving…';
  const { error } = await supabase.from('habits').insert({ name, target_per_week: targetPerWeek });
  saveButton.disabled = false;
  if (error) {
    habitFormStatus.textContent = error.message;
    return;
  }
  habitDialog.close();
  await loadHabits();
});

function showAuthForm(createAccount = false) {
  if (!supabase) {
    authStatus.textContent = 'Connection settings are missing. Check the local .env file.';
    if (!authDialog.open) authDialog.showModal();
    return;
  }
  isCreatingAccount = createAccount;
  isResettingPassword = false;
  authTitle.textContent = createAccount ? 'Create your account' : 'Welcome back';
  authDescription.textContent = createAccount
    ? 'Start building better habits with your people.'
    : 'Sign in to check in on your habits and your room.';
  authSubmit.textContent = createAccount ? 'Create account' : 'Sign in';
  displayNameGroup.hidden = !createAccount;
  document.querySelector('#display-name').required = createAccount;
  document.querySelector('#signup-username').required = createAccount;
  authPasswordLabel.textContent = 'Password';
  authPassword.placeholder = 'At least 8 characters';
  authSwitchLabel.textContent = createAccount ? 'Already have an account?' : 'New to HabitArena?';
  authSwitch.textContent = createAccount ? 'Sign in' : 'Create an account';
  authSwitchRow.hidden = false;
  forgotPassword.hidden = createAccount;
  authPassword.autocomplete = createAccount ? 'new-password' : 'current-password';
  authStatus.textContent = '';
  if (!authDialog.open) authDialog.showModal();
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'sign-in') {
      showAuthForm(false);
      return;
    }
    if (action === 'sign-out') {
      const confirmed = await askForConfirmation('Are you sure you want to sign out of HabitArena?', {
        title: 'Sign out?', confirmText: 'Sign out',
      });
      if (!confirmed) return;
      const { error } = await supabase.auth.signOut();
      if (error) showToast(error.message, 'error');
      return;
    }
    if (action === 'profile') return;
    if (action === 'create-room') {
      if (!currentUser) {
        pendingRoomAction = 'create';
        showAuthForm(false);
        return;
      }
      showRoomForm(false);
      return;
    }
    if (action === 'join-room') {
      if (!currentUser) {
        pendingRoomAction = 'join';
        showAuthForm(false);
        return;
      }
      showRoomForm(true);
      return;
    }
    if (action === 'add-habit') return;
  });
});

authSwitch.addEventListener('click', () => showAuthForm(!isCreatingAccount));

forgotPassword.addEventListener('click', async () => {
  const emailField = document.querySelector('#auth-email');
  const email = emailField.value.trim();
  if (!email) {
    authStatus.textContent = 'Enter your account email above, then choose Forgot password?';
    emailField.focus();
    return;
  }
  forgotPassword.disabled = true;
  authStatus.textContent = 'Sending password reset link…';
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    authStatus.textContent = error
      ? error.message
      : 'If an account uses that email, a password reset link is on its way.';
  } catch {
    authStatus.textContent = 'Could not connect. Check your internet connection and try again.';
  } finally {
    forgotPassword.disabled = false;
  }
});

document.querySelector('#auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  authStatus.textContent = 'Connecting…';
  const email = document.querySelector('#auth-email').value.trim();
  const password = authPassword.value;
  if (isResettingPassword) {
    authStatus.textContent = 'Updating password…';
    supabase.auth.updateUser({ password }).then(({ error }) => {
      if (error) {
        authStatus.textContent = error.message;
        return;
      }
      showAuthForm(false);
      authStatus.textContent = 'Password updated. You can now sign in with it.';
    }).catch(() => {
      authStatus.textContent = 'Could not connect. Check your internet connection and try again.';
    });
    return;
  }
  const creatingAccount = isCreatingAccount;
  const request = creatingAccount
    ? supabase.auth.signUp({
      email,
      password,
      options: { data: {
        display_name: document.querySelector('#display-name').value.trim(),
        username: document.querySelector('#signup-username').value.trim().toLowerCase(),
      } },
    })
    : supabase.auth.signInWithPassword({ email, password });

  request.then(({ data, error }) => {
    if (error) {
      authStatus.textContent = error.message;
      return;
    }
    if (creatingAccount && !data.session) {
      pendingRoomAction = null;
      showAuthForm(false);
      authStatus.textContent = 'Account created. Confirm your email, then sign in here.';
      return;
    }
    if (data.session) {
      applyAuthState(data.session);
      authDialog.close();
      if (pendingRoomAction) {
        const nextAction = pendingRoomAction;
        pendingRoomAction = null;
        showRoomForm(nextAction === 'join');
      }
      return;
    }
    authStatus.textContent = 'No active session was returned. Please try signing in again.';
  }).catch(() => {
    authStatus.textContent = 'Could not connect. Check your internet connection and try again.';
  });
});

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      // Let Supabase finish its auth event before loading the signed-in user's data.
      window.setTimeout(() => {
        applyAuthState(session);
        if (event === 'SIGNED_IN' && authDialog.open) authDialog.close();
      }, 0);
      return;
    }
    if (event === 'SIGNED_OUT') {
      window.setTimeout(() => applyAuthState(null), 0);
      return;
    }
    if (event === 'PASSWORD_RECOVERY') {
      isResettingPassword = true;
      isCreatingAccount = false;
      authTitle.textContent = 'Choose a new password';
      authDescription.textContent = 'Set a new password for your HabitArena account.';
      authPasswordLabel.textContent = 'New password';
      authPassword.value = '';
      authPassword.placeholder = 'At least 8 characters';
      authPassword.autocomplete = 'new-password';
      authSubmit.textContent = 'Update password';
      authSwitchRow.hidden = true;
      forgotPassword.hidden = true;
      authStatus.textContent = '';
      if (!authDialog.open) authDialog.showModal();
    }
  });
}
