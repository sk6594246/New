/* =====================================================================
   STRATEGA PM — Patch: Features #22, #23, #24, #25
   #22 Inline Kanban comments
   #23 Analytics drill-down into filtered Kanban
   #24 Interactive Gantt: expand/collapse, drag-move/resize, FS cascade
   #25 Kanban Department filter (alongside existing Project filter)

   Load this AFTER the main app script, right before </body>.
   All functions below intentionally re-declare globals already defined
   in index_kikik2_6_v2.html — later script wins, so this overrides them
   without editing the original file.
   ===================================================================== */

/* ---------- shared state ---------- */
App.kanbanDeptFilter = App.kanbanDeptFilter || 'all';
App.ganttCollapsed   = App.ganttCollapsed   || new Set();
App.ganttDrag        = null; // active drag/resize state
App.openKanbanComments = App.openKanbanComments || new Set(); // taskIds with popover open

/* =====================================================================
   #25 — KANBAN DEPARTMENT FILTER
   ===================================================================== */
function injectKanbanDeptFilterUI() {
  const bar = document.querySelector('.kanban-filters');
  if (!bar || document.getElementById('kanbanDeptFilterWrap')) return;
  const wrap = document.createElement('div');
  wrap.id = 'kanbanDeptFilterWrap';
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:8px;';
  wrap.innerHTML = '<select class="project-selector" id="kanbanDeptFilter" onchange="setKanbanDeptFilter(this.value)">'
    + '<option value="all">All Departments</option>'
    + App.data.departments.map(d => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('')
    + '</select>';
  bar.appendChild(wrap);
}
function setKanbanDeptFilter(deptId) {
  App.kanbanDeptFilter = deptId === 'all' ? 'all' : parseInt(deptId);
  renderKanban();
}

/* =====================================================================
   #22 — INLINE KANBAN COMMENTS
   ===================================================================== */
function toggleKanbanComments(taskId, evt) {
  if (evt) evt.stopPropagation();
  if (App.openKanbanComments.has(taskId)) App.openKanbanComments.delete(taskId);
  else App.openKanbanComments.add(taskId);
  renderKanban();
}
function renderKanbanCommentsBlock(task) {
  if (!App.openKanbanComments.has(task.id)) return '';
  const comments = App.data.comments.filter(c => c.task_id === task.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let html = '<div class="kc-comments" onclick="event.stopPropagation()" style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">';
  html += '<div style="max-height:140px;overflow-y:auto;margin-bottom:8px;">';
  if (comments.length === 0) {
    html += '<div style="color:var(--text-muted);font-size:12px;">No comments yet</div>';
  } else {
    comments.forEach(c => {
      const user = App.data.users.find(u => u.id === c.user_id);
      html += '<div class="comment-item" style="padding:6px 0;">'
        + '<div class="comment-header"><span class="comment-author">' + esc(user?.name || 'Unknown') + '</span>'
        + '<span class="comment-time">' + timeAgo(c.created_at) + '</span></div>'
        + '<div class="comment-text">' + esc(c.text) + '</div></div>';
    });
  }
  html += '</div>';
  html += '<div class="comment-input-row">'
    + '<input type="text" class="glass-input" id="kcInput-' + task.id + '" placeholder="Write a comment..." '
    + 'onkeydown="if(event.key===\'Enter\'){addCommentInline(' + task.id + ')}">'
    + '<button class="glass-btn primary" onclick="addCommentInline(' + task.id + ')">Post</button>'
    + '</div></div>';
  return html;
}
function addCommentInline(taskId) {
  const input = document.getElementById('kcInput-' + taskId);
  const text = (input?.value || '').trim();
  if (!text) return;
  const newId = Math.max(...App.data.comments.map(c => c.id), 0) + 1;
  App.data.comments.push({ id: newId, task_id: taskId, user_id: App.currentUser.id, text: text, created_at: new Date().toISOString() });
  saveToStorage(); syncToGoogleSheets();
  App.openKanbanComments.add(taskId); // keep it open after posting
  renderKanban();
  showToast('Comment added', 'success');
}

/* Override: Kanban card render (adds comment badge-as-toggle + inline panel) */
function renderKanbanCard(task) {
  const priority = App.data.priorities.find(p => p.id === task.priority_id);
  const assignee = App.data.users.find(u => u.id === task.assigned_to);
  const comments = App.data.comments.filter(c => c.task_id === task.id);
  const nextStatus = getNextStatus(task.status_id);
  let html = '<div class="kanban-card" draggable="true" ondragstart="dragStart(event,' + task.id + ')" ondragend="dragEnd(event)">';
  html += '<div class="card-priority-bar" style="background:' + (priority ? priority.color : '#78909c') + '"></div>';
  html += '<div class="card-header"><div class="card-title">' + esc(task.title) + '</div>';
  html += '<div class="card-actions">';
  html += '<button class="card-action-btn" onclick="openTaskModal(' + task.id + ')" title="Edit">&#9999;</button>';
  if (canEdit(task)) html += '<button class="card-action-btn" onclick="deleteTask(' + task.id + ')" title="Delete">&#128465;</button>';
  html += '</div></div>';
  html += '<div class="card-meta">';
  if (priority) html += '<span class="badge priority-' + priority.name.toLowerCase() + '">' + priority.name + '</span>';
  if (task.category) html += '<span class="card-meta-item">&#128193; ' + esc(task.category) + '</span>';
  html += '</div>';
  if (task.planned_start || task.planned_finish) html += '<div class="card-dates">&#128197; ' + (task.planned_start || '?') + ' &rarr; ' + (task.planned_finish || '?') + '</div>';
  html += '<div style="display:flex;align-items:center;margin-top:8px;">';
  html += '<span class="card-comments-badge" style="cursor:pointer;" onclick="toggleKanbanComments(' + task.id + ', event)" title="Comments">&#128172; ' + comments.length + '</span>';
  html += '<div style="flex:1;"></div>';
  if (assignee) html += '<div class="card-assignee" title="' + esc(assignee.name) + '">' + getInitials(assignee.name) + '</div>';
  if (nextStatus && canEdit(task)) html += '<button class="status-cycle-btn" onclick="cycleStatus(' + task.id + ',' + nextStatus.id + ')" title="Move to ' + esc(nextStatus.name) + '">&#10145;</button>';
  html += '</div>';
  html += renderKanbanCommentsBlock(task);
  html += '</div>';
  return html;
}

/* Override: Kanban board render — adds department filter + drill-down filter support */
function renderKanban() {
  injectKanbanDeptFilterUI();
  const deptSelect = document.getElementById('kanbanDeptFilter');
  if (deptSelect && deptSelect.value != App.kanbanDeptFilter) deptSelect.value = App.kanbanDeptFilter;

  const board = document.getElementById('kanbanBoard');
  let tasks = getFilteredTasks();

  if (App.kanbanFilter !== 'all') {
    const pid = App.data.priorities.find(p => p.name.toLowerCase() === App.kanbanFilter)?.id;
    if (pid) tasks = tasks.filter(t => t.priority_id === pid);
  }
  if (App.kanbanDeptFilter !== 'all') {
    tasks = tasks.filter(t => t.department_id === App.kanbanDeptFilter);
  }
  if (App.kanbanMineOnly && App.currentUser) tasks = tasks.filter(t => t.assigned_to === App.currentUser.id);

  // #23 drill-down filter, set by openDrilldown()
  if (App.kanbanDrilldown) {
    const df = App.kanbanDrilldown;
    if (df.status_id != null) tasks = tasks.filter(t => t.status_id === df.status_id);
    if (df.department_id != null) tasks = tasks.filter(t => t.department_id === df.department_id);
    if (df.assigned_to != null) tasks = tasks.filter(t => t.assigned_to === df.assigned_to);
  }

  let html = '';
  if (App.kanbanDrilldown) {
    html += '<div class="glass-card" style="margin-bottom:12px;padding:10px 14px;display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:13px;color:var(--text-secondary);">Filtered from Analytics: <strong>' + esc(App.kanbanDrilldown.label) + '</strong></span>'
      + '<button class="glass-btn" style="margin-left:auto;" onclick="clearDrilldown()">Clear filter &times;</button></div>';
  }

  const sortedStatuses = App.data.statuses.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  sortedStatuses.forEach(status => {
    const statusTasks = tasks.filter(t => t.status_id === status.id);
    html += '<div class="kanban-column" data-status-id="' + status.id + '">';
    html += '<div class="column-header"><div class="column-title"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + status.color + ';margin-right:6px;"></span>' + esc(status.name) + '</div><div class="column-badge">' + statusTasks.length + '</div></div>';
    html += '<div class="column-body drop-zone" ondragover="allowDrop(event)" ondrop="dropTask(event,' + status.id + ')" ondragleave="dragLeave(event)">';
    statusTasks.forEach(task => { html += renderKanbanCard(task); });
    html += '</div></div>';
  });
  board.innerHTML = html;
}

/* =====================================================================
   #23 — ANALYTICS DRILL-DOWN INTO FILTERED KANBAN
   ===================================================================== */
/* Override: bar chart renderer — stores a resolvable "key" per bar and wires click */
function renderBarChart(containerId, data, onBarClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...data.map(d => d.value), 1);
  let html = '<div class="bar-chart-y-axis">';
  for (let i = 4; i >= 0; i--) html += '<span>' + Math.round(max * i / 4) + '</span>';
  html += '</div><div class="bar-chart-bars">';
  data.forEach((d, idx) => {
    html += '<div class="bar-chart-bar" data-idx="' + idx + '" style="height:' + ((d.value / max) * 100) + '%;cursor:' + (onBarClick ? 'pointer' : 'default') + ';" title="' + esc(String(d.label)) + ': ' + d.value + '"><span class="bar-chart-label">' + esc(String(d.label)) + '</span></div>';
  });
  html += '</div>';
  container.innerHTML = html;
  if (onBarClick) {
    container.querySelectorAll('.bar-chart-bar').forEach(el => {
      el.addEventListener('click', () => onBarClick(data[parseInt(el.dataset.idx)]));
    });
  }
}

/* Override: analytics render — wires each chart's bars to a drill-down handler */
function renderAnalytics() {
  const tasks = getFilteredTasks();

  // Status chart -> drill into that status
  const statusCounts = {}; App.data.statuses.forEach(s => statusCounts[s.name] = 0);
  tasks.forEach(t => { const s = App.data.statuses.find(s => s.id === t.status_id); if (s) statusCounts[s.name]++; });
  renderBarChart('statusChart', Object.entries(statusCounts).map(([k, v]) => ({ label: k, value: v, key: k })),
    (d) => {
      const status = App.data.statuses.find(s => s.name === d.key);
      if (status) openDrilldown({ status_id: status.id, label: 'Status = ' + status.name });
    });

  // Bottleneck chart (avg days in status) -> drill into that status
  const bottleneckData = App.data.statuses.map(s => {
    const st = tasks.filter(t => t.status_id === s.id);
    const avgDays = st.reduce((sum, t) => {
      const start = t.actual_start ? new Date(t.actual_start) : new Date(t.planned_start);
      const end = t.actual_finish ? new Date(t.actual_finish) : new Date();
      return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
    }, 0) / Math.max(st.length, 1);
    return { label: s.name, value: Math.round(avgDays * 10) / 10, key: s.id };
  });
  renderBarChart('bottleneckChart', bottleneckData,
    (d) => openDrilldown({ status_id: d.key, label: 'Bottleneck: ' + App.data.statuses.find(s => s.id === d.key)?.name }));

  // Department workload chart -> drill into that department
  const deptData = App.data.departments.map(d => ({ label: d.name.substring(0, 10), value: tasks.filter(t => t.department_id === d.id).length, key: d.id }));
  renderBarChart('deptWorkloadChart', deptData,
    (d) => openDrilldown({ department_id: d.key, label: 'Department = ' + App.data.departments.find(x => x.id === d.key)?.name }));

  // Time-in-state (actual work hours) chart -> drill into that status
  const timeData = App.data.statuses.map(s => ({ label: s.name.substring(0, 8), value: Math.round(tasks.filter(t => t.status_id === s.id).reduce((sum, t) => sum + (t.actual_work || 0), 0)), key: s.id }));
  renderBarChart('timeInStateChart', timeData,
    (d) => openDrilldown({ status_id: d.key, label: 'Time-in-state: ' + App.data.statuses.find(s => s.id === d.key)?.name }));
}

function openDrilldown(filterObj) {
  App.kanbanDrilldown = filterObj;
  switchView('kanban');
  renderKanban();
  showToast('Showing filtered Kanban: ' + filterObj.label, 'info');
}
function clearDrilldown() {
  App.kanbanDrilldown = null;
  renderKanban();
}

/* =====================================================================
   #24 — INTERACTIVE GANTT: expand/collapse, drag-move/resize, FS cascade
   ===================================================================== */

/* --- dependency helpers (Finish-to-Start only, v1) --- */
function getSuccessors(taskId) {
  return App.data.tasks.filter(t => (t.predecessors || []).some(p => p.id === taskId));
}
function shiftTaskDates(task, deltaDays, visited) {
  visited = visited || new Set();
  if (visited.has(task.id)) return; // cycle guard
  visited.add(task.id);
  if (task.planned_start) task.planned_start = addDaysToDateStr(task.planned_start, deltaDays);
  if (task.planned_finish) task.planned_finish = addDaysToDateStr(task.planned_finish, deltaDays);
  getSuccessors(task.id).forEach(succ => shiftTaskDates(succ, deltaDays, visited));
}
function addDaysToDateStr(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toggleGanttGroup(projectId) {
  if (App.ganttCollapsed.has(projectId)) App.ganttCollapsed.delete(projectId);
  else App.ganttCollapsed.add(projectId);
  renderGantt();
}

/* Override: Gantt render — groups by project (collapsible) + drag/resize handles */
function renderGantt() {
  const container = document.getElementById('ganttContainer');
  let tasks = getFilteredTasks();
  const projFilter = document.getElementById('ganttProjectFilter')?.value || 'all';
  const deptFilter = document.getElementById('ganttDeptFilter')?.value || 'all';
  if (projFilter !== 'all') tasks = tasks.filter(t => t.project_id == projFilter);
  if (deptFilter !== 'all') tasks = tasks.filter(t => t.department_id == deptFilter);
  if (tasks.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128197;</div><div class="empty-state-title">No tasks to display</div></div>'; return; }

  let minDate = new Date(); let maxDate = new Date();
  tasks.forEach(t => {
    [t.planned_start, t.planned_finish, t.actual_start, t.actual_finish, t.baseline_1_start, t.baseline_1_finish, t.baseline_2_start, t.baseline_2_finish].filter(Boolean).forEach(d => {
      const date = new Date(d); if (date < minDate) minDate = date; if (date > maxDate) maxDate = date;
    });
  });
  minDate.setDate(minDate.getDate() - 3); maxDate.setDate(maxDate.getDate() + 7);
  const dayCount = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

  // stash for drag math
  App.ganttMinDate = new Date(minDate);
  App.ganttDayCount = dayCount;

  let html = '<div class="gantt-chart" id="ganttChartEl">';
  html += '<div class="gantt-header"><div class="gantt-task-label">Task</div><div class="gantt-timeline-header">';
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(minDate); d.setDate(d.getDate() + i);
    const cls = (d.getDay() === 0 || d.getDay() === 6 ? 'weekend ' : '') + (d.toDateString() === new Date().toDateString() ? 'today' : '');
    html += '<div class="gantt-day-header ' + cls + '">' + d.getDate() + '</div>';
  }
  html += '</div></div>';
  const todayOffset = Math.ceil((new Date() - minDate) / (1000 * 60 * 60 * 24));
  if (todayOffset >= 0 && todayOffset < dayCount) {
    html += '<div class="gantt-today-line" style="left:calc(200px + ' + ((todayOffset / dayCount) * 100) + '%);"><div class="gantt-today-label">Today</div></div>';
  }

  // group by project, preserving App.data.projects order
  const grouped = App.data.projects.map(p => ({ project: p, items: tasks.filter(t => t.project_id === p.id) })).filter(g => g.items.length > 0);
  const ungrouped = tasks.filter(t => !App.data.projects.some(p => p.id === t.project_id));
  if (ungrouped.length) grouped.push({ project: { id: '__none', name: 'Unassigned' }, items: ungrouped });

  grouped.forEach(group => {
    const collapsed = App.ganttCollapsed.has(group.project.id);
    html += '<div class="gantt-row gantt-group-row" style="cursor:pointer;background:rgba(255,255,255,0.04);" onclick="toggleGanttGroup(' + (typeof group.project.id === 'string' ? "'" + group.project.id + "'" : group.project.id) + ')">'
      + '<div class="gantt-task-name" style="font-weight:600;">' + (collapsed ? '&#9656; ' : '&#9662; ') + esc(group.project.name) + ' (' + group.items.length + ')</div>'
      + '<div class="gantt-timeline"></div></div>';
    if (collapsed) return;
    group.items.forEach(task => { html += renderGanttTaskRow(task, minDate, dayCount); });
  });

  html += '</div>';
  container.innerHTML = html;
  wireGanttDragHandlers();
}

function renderGanttTaskRow(task, minDate, dayCount) {
  let html = '<div class="gantt-row" data-task-id="' + task.id + '"><div class="gantt-task-name">' + esc(task.title) + '</div><div class="gantt-timeline">';
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(minDate); d.setDate(d.getDate() + i);
    const pct = (i / dayCount) * 100; const width = (1 / dayCount) * 100;
    let cls = 'gantt-gridline'; if (d.getDay() === 1) cls += ' week'; if (d.getDate() === 1) cls += ' month';
    html += '<div class="' + cls + '" style="left:' + pct + '%;width:' + width + '%;"></div>';
  }
  [['planned', task.planned_start, task.planned_finish], ['actual', task.actual_start, task.actual_finish], ['baseline1', task.baseline_1_start, task.baseline_1_finish], ['baseline2', task.baseline_2_start, task.baseline_2_finish]].forEach(([type, start, finish]) => {
    if (start && finish) {
      const s = Math.ceil((new Date(start) - minDate) / (1000 * 60 * 60 * 24));
      const dur = Math.ceil((new Date(finish) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
      const left = (s / dayCount) * 100; const width = (dur / dayCount) * 100;
      const label = type === 'planned' ? 'Planned' : type === 'actual' ? 'Actual' : '';
      const editable = type === 'planned' && canEdit(task);
      html += '<div class="gantt-bar ' + type + '" data-task-id="' + task.id + '" data-bar-type="' + type + '" '
        + (editable ? 'draggable="false" ' : '')
        + 'style="left:' + left + '%;width:' + width + '%;' + (editable ? 'cursor:grab;' : '') + '" '
        + 'title="' + type + ': ' + start + ' to ' + finish + '">'
        + (editable ? '<div class="gantt-resize-handle left" data-task-id="' + task.id + '" data-handle="left"></div>' : '')
        + label
        + (editable ? '<div class="gantt-resize-handle right" data-task-id="' + task.id + '" data-handle="right"></div>' : '')
        + '</div>';
    }
  });
  html += '</div></div>';
  return html;
}

/* --- drag/resize wiring (pointer events, works for mouse + touch) --- */
function wireGanttDragHandlers() {
  const chart = document.getElementById('ganttChartEl');
  if (!chart) return;

  chart.querySelectorAll('.gantt-bar.planned').forEach(bar => {
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('gantt-resize-handle')) return; // handled separately
      startGanttDrag(e, bar, 'move');
    });
  });
  chart.querySelectorAll('.gantt-resize-handle').forEach(handle => {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const bar = handle.closest('.gantt-bar');
      startGanttDrag(e, bar, handle.dataset.handle === 'left' ? 'resize-left' : 'resize-right');
    });
  });
}

function startGanttDrag(e, barEl, mode) {
  e.preventDefault();
  const taskId = parseInt(barEl.dataset.taskId);
  const task = App.data.tasks.find(t => t.id === taskId);
  if (!task || !canEdit(task)) return;
  const timeline = barEl.closest('.gantt-timeline');
  const pxPerDay = timeline.getBoundingClientRect().width / App.ganttDayCount;

  App.ganttDrag = {
    taskId, mode, startX: e.clientX, pxPerDay,
    origStart: task.planned_start, origFinish: task.planned_finish,
    barEl
  };
  barEl.style.cursor = 'grabbing';
  window.addEventListener('pointermove', onGanttDragMove);
  window.addEventListener('pointerup', onGanttDragEnd, { once: true });
}

function onGanttDragMove(e) {
  const drag = App.ganttDrag;
  if (!drag) return;
  const deltaPx = e.clientX - drag.startX;
  const deltaDays = Math.round(deltaPx / drag.pxPerDay);
  // visual-only ghost transform; real date math happens on drop
  drag.barEl.style.transform = 'translateX(' + (deltaDays * (100 / App.ganttDayCount)) + '%)';
  drag.pendingDeltaDays = deltaDays;
}

function onGanttDragEnd() {
  window.removeEventListener('pointermove', onGanttDragMove);
  const drag = App.ganttDrag;
  App.ganttDrag = null;
  if (!drag) return;
  drag.barEl.style.transform = '';
  drag.barEl.style.cursor = 'grab';

  const deltaDays = drag.pendingDeltaDays || 0;
  if (deltaDays === 0) return;

  const task = App.data.tasks.find(t => t.id === drag.taskId);
  if (!task) return;

  if (drag.mode === 'move') {
    shiftTaskDates(task, deltaDays); // cascades FS successors too
    logAudit(task.id, 'Planned dates shifted by ' + deltaDays + ' day(s), including dependent tasks');
  } else if (drag.mode === 'resize-left') {
    const newStart = addDaysToDateStr(drag.origStart, deltaDays);
    if (new Date(newStart) < new Date(task.planned_finish)) {
      task.planned_start = newStart;
      logAudit(task.id, 'Planned start resized to ' + newStart);
    }
  } else if (drag.mode === 'resize-right') {
    const newFinish = addDaysToDateStr(drag.origFinish, deltaDays);
    if (new Date(newFinish) > new Date(task.planned_start)) {
      task.planned_finish = newFinish;
      logAudit(task.id, 'Planned finish resized to ' + newFinish);
    }
  }
  // keep planned_duration in sync
  if (task.planned_start && task.planned_finish) {
    task.planned_duration = Math.ceil((new Date(task.planned_finish) - new Date(task.planned_start)) / (1000 * 60 * 60 * 24)) + 1;
  }
  saveToStorage(); syncToGoogleSheets(); renderGantt();
  showToast('Gantt updated', 'success');
}

/* =====================================================================
   #24b — minimal UI for setting predecessors (used by task modal)
   Call wireTaskModalPredecessorsUI() from openTaskModal() if you want a
   picker; otherwise predecessors can be set programmatically:
   task.predecessors = [{ id: 3, type: 'FS' }];
   ===================================================================== */
function renderPredecessorPicker(task) {
  const others = App.data.tasks.filter(t => t.id !== task.id);
  const current = (task.predecessors || []).map(p => p.id);
  return '<div class="form-group"><label>Predecessors (Finish-to-Start)</label>'
    + '<select multiple class="glass-input" id="taskPredecessors" style="height:100px;">'
    + others.map(t => '<option value="' + t.id + '"' + (current.includes(t.id) ? ' selected' : '') + '>' + esc(t.title) + '</option>').join('')
    + '</select></div>';
}
function readPredecessorPickerIntoTask(task) {
  const sel = document.getElementById('taskPredecessors');
  if (!sel) return;
  task.predecessors = Array.from(sel.selectedOptions).map(o => ({ id: parseInt(o.value), type: 'FS' }));
}

/* =====================================================================
   Styling for new UI (injected once, no HTML edit required)
   ===================================================================== */
(function injectPatchStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .kc-comments { animation: fadeIn 0.15s ease; }
    .gantt-group-row:hover { background: rgba(255,255,255,0.08) !important; }
    .gantt-resize-handle {
      position: absolute; top: 0; bottom: 0; width: 6px; cursor: ew-resize;
      background: rgba(255,255,255,0.25); border-radius: 3px;
    }
    .gantt-resize-handle.left { left: 0; }
    .gantt-resize-handle.right { right: 0; }
    .gantt-bar.planned { position: relative; touch-action: none; }
    .bar-chart-bar { transition: filter 0.15s ease; }
    .bar-chart-bar:hover { filter: brightness(1.3); }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
})();

/* Initial paint once DOM + data are ready */
document.addEventListener('DOMContentLoaded', () => {
  // renderAll() already runs from the main script after login/init;
  // this just ensures the dept filter exists if kanban is the first view.
  setTimeout(injectKanbanDeptFilterUI, 300);
});
