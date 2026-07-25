/* =====================================================================
   STRATEGA PM — Patch: Login with User ID + PIN (Feature #1)

   Current login only matched PIN against ALL users. This adds a
   User ID field and requires BOTH to match — strictly against the
   `login_id` field pulled from the Google Sheet. There is no fallback
   to name/slug/numeric id: if a user has no `login_id` set in the
   Sheet, they cannot log in until one is assigned (via the User modal
   or directly in the Users sheet).

   Load this alongside your other patch scripts, right before </body>:
   <script src="login-userid-patch.js"></script>
   ===================================================================== */

/* ---------- 1. Inject the User ID field above the PIN dots ---------- */
function injectLoginUserIdField() {
  const pinDots = document.getElementById('pinDots');
  if (!pinDots || document.getElementById('loginUserId')) return;
  const pinLabel = pinDots.previousElementSibling; // the "Enter your PIN" div

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:18px;';
  wrap.innerHTML =
    '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">User ID</div>' +
    '<input type="text" id="loginUserId" class="glass-input" placeholder="Enter your Login ID" ' +
    'style="width:100%;text-align:center;" autocomplete="username" autocapitalize="off">';

  pinLabel.parentElement.insertBefore(wrap, pinLabel);

  // Enter key in the User ID field just focuses the pin pad conceptually;
  // nothing else required since the numeric pad drives verification.
  document.getElementById('loginUserId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });
}

/* ---------- 2. Update the "Default PIN" hint (no assumed default User ID) ---------- */
function updateLoginHintText() {
  document.querySelectorAll('#loginScreen div').forEach(d => {
    if (d.children.length === 0 && d.textContent.includes('Default PIN')) {
      d.innerHTML = 'Enter the Login ID assigned to your account, plus your PIN.';
    }
  });
}

/* ---------- 3. Override verifyPin() to require both fields ---------- */
function verifyPin() {
  const idInput = document.getElementById('loginUserId');
  const idVal = (idInput?.value || '').trim();

  if (!idVal) {
    document.getElementById('loginError').textContent = 'Enter your User ID.';
    pinBuffer = '';
    setTimeout(updatePinDots, 400);
    idInput?.focus();
    return;
  }

  const idLower = idVal.toLowerCase();
  const user = App.data.users.find(u => (u.login_id || '').trim().toLowerCase() === idLower);

  if (user && user.pin_hash === pinBuffer) {
    App.currentUser = user;
    pinBuffer = '';
    updatePinDots();
    if (idInput) idInput.value = '';
    saveToStorage();
    showApp();
    showToast('Welcome, ' + user.name + '!', 'success');
  } else {
    document.getElementById('loginError').textContent = 'Invalid User ID or PIN. Try again.';
    pinBuffer = '';
    setTimeout(updatePinDots, 500);
  }
}

/* ---------- 4. Let admins set a friendly Login ID from the User modal ---------- */
function ensureLoginIdInput() {
  if (document.getElementById('userLoginId')) return;
  const nameInput = document.getElementById('userNameInput');
  if (!nameInput) return;
  const nameGroup = nameInput.closest('.form-group');
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  wrap.innerHTML = '<label class="form-label">Login ID (optional — used at sign-in instead of full name)</label>'
    + '<input type="text" class="glass-input" id="userLoginId" placeholder="e.g. jsmith">';
  nameGroup.parentElement.insertBefore(wrap, nameGroup.nextSibling);
}

if (typeof openUserModal === 'function') {
  const _openUserModal = openUserModal;
  openUserModal = function (userId) {
    _openUserModal(userId);
    ensureLoginIdInput();
    const user = userId ? App.data.users.find(u => u.id === userId) : null;
    const field = document.getElementById('userLoginId');
    if (field) field.value = user?.login_id || '';
  };
}

if (typeof saveUser === 'function') {
  const _saveUser = saveUser;
  saveUser = function () {
    const loginIdVal = document.getElementById('userLoginId')?.value.trim() || '';
    const idField = document.getElementById('userId').value;
    const wasEdit = !!idField;
    const countBefore = App.data.users.length;

    _saveUser(); // runs original validation/create/update — bails out early if invalid

    let target = null;
    if (wasEdit) {
      target = App.data.users.find(u => u.id == idField);
    } else if (App.data.users.length > countBefore) {
      target = App.data.users.reduce((a, b) => (b.id > a.id ? b : a), App.data.users[0]);
    }
    if (target) {
      target.login_id = loginIdVal || null;
      saveToStorage();
      syncToGoogleSheets();
    }
  };
}

/* ---------- 5. Wire it up on load ---------- */
document.addEventListener('DOMContentLoaded', () => {
  injectLoginUserIdField();
  updateLoginHintText();
});
