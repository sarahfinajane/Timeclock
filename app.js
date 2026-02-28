/* Local Timesheet (GitHub Pages friendly)
   - Stores data in localStorage on the current device
   - Groups entries by day of week
   - Calculates hours per entry + totals
*/

const STORAGE_KEY = "local_timesheet_v1";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const els = {
  form: document.getElementById("entryForm"),
  employee: document.getElementById("employee"),
  day: document.getElementById("day"),
  timeIn: document.getElementById("timeIn"),
  timeOut: document.getElementById("timeOut"),
  notes: document.getElementById("notes"),
  daysContainer: document.getElementById("daysContainer"),
  weeklyTotal: document.getElementById("weeklyTotal"),
  printBtn: document.getElementById("printBtn"),
  clearBtn: document.getElementById("clearBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importFile: document.getElementById("importFile"),
  quickNowIn: document.getElementById("quickNowIn"),
  quickNowOut: document.getElementById("quickNowOut"),
  dayTemplate: document.getElementById("dayTemplate"),
  rowTemplate: document.getElementById("rowTemplate"),
};

let state = loadState();

/* ---------- Utilities ---------- */

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw);
    if (!parsed.entries || !Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowAsTimeInput() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Returns minutes from 00:00 for "HH:MM"
function timeToMinutes(t) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

// Handles crossing midnight: if out < in, assume next day
function computeHours(timeIn, timeOut) {
  const inMin = timeToMinutes(timeIn);
  const outMin = timeToMinutes(timeOut);
  let diff = outMin - inMin;
  if (diff < 0) diff += 24 * 60; // past midnight
  return diff / 60;
}

function hoursToFixed(h) {
  return (Math.round(h * 100) / 100).toFixed(2);
}

/* ---------- Render ---------- */

function render() {
  els.daysContainer.innerHTML = "";

  let weekly = 0;

  for (const day of DAYS) {
    const dayEntries = state.entries.filter(e => e.day === day);

    const dayNode = els.dayTemplate.content.cloneNode(true);
    dayNode.querySelector(".day-title").textContent = day;

    const tbody = dayNode.querySelector(".rows");

    let dayTotal = 0;

    for (const entry of dayEntries) {
      const h = computeHours(entry.timeIn, entry.timeOut);
      dayTotal += h;

      const row = els.rowTemplate.content.cloneNode(true);
      row.querySelector(".emp").textContent = entry.employee;
      row.querySelector(".tin").textContent = entry.timeIn;
      row.querySelector(".tout").textContent = entry.timeOut;
      row.querySelector(".hrs").textContent = hoursToFixed(h);
      row.querySelector(".nts").textContent = entry.notes ? entry.notes : "";

      const editBtn = row.querySelector(".edit");
      const delBtn = row.querySelector(".del");

      editBtn.addEventListener("click", () => editEntry(entry.id));
      delBtn.addEventListener("click", () => deleteEntry(entry.id));

      tbody.appendChild(row);
    }

    dayNode.querySelector(".day-total").textContent = hoursToFixed(dayTotal);

    weekly += dayTotal;
    els.daysContainer.appendChild(dayNode);
  }

  els.weeklyTotal.textContent = hoursToFixed(weekly);
}

function addEntry({ employee, day, timeIn, timeOut, notes }) {
  state.entries.push({
    id: uid(),
    employee: employee.trim(),
    day,
    timeIn,
    timeOut,
    notes: notes.trim(),
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
}

function deleteEntry(id) {
  const ok = confirm("Delete this entry?");
  if (!ok) return;
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  render();
}

function editEntry(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  // Simple edit flow: load into form and delete original once resubmitted
  els.employee.value = entry.employee;
  els.day.value = entry.day;
  els.timeIn.value = entry.timeIn;
  els.timeOut.value = entry.timeOut;
  els.notes.value = entry.notes || "";

  // Remove original
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  render();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Events ---------- */

els.form.addEventListener("submit", (e) => {
  e.preventDefault();

  const employee = els.employee.value;
  const day = els.day.value;
  const timeIn = els.timeIn.value;
  const timeOut = els.timeOut.value;
  const notes = els.notes.value;

  if (!employee.trim()) return alert("Please enter an employee name.");
  if (!timeIn || !timeOut) return alert("Please enter time in and time out.");

  addEntry({ employee, day, timeIn, timeOut, notes });

  // Keep employee name for fast entry if you want; clear times + notes
  els.timeIn.value = "";
  els.timeOut.value = "";
  els.notes.value = "";
  els.timeIn.focus();
});

els.printBtn.addEventListener("click", () => {
  window.print();
});

els.clearBtn.addEventListener("click", () => {
  const ok = confirm("This will delete ALL saved entries from this device. Continue?");
  if (!ok) return;
  state = { entries: [] };
  saveState();
  render();
});

els.quickNowIn.addEventListener("click", () => {
  els.timeIn.value = nowAsTimeInput();
});

els.quickNowOut.addEventListener("click", () => {
  els.timeOut.value = nowAsTimeInput();
});

/* Export / Import (optional but helpful) */
els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `timesheet-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
});

els.importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed.entries || !Array.isArray(parsed.entries)) {
      alert("That file doesn't look like a timesheet export.");
      return;
    }

    // Basic validation / sanitize
    const cleaned = parsed.entries
      .filter(x => x && DAYS.includes(x.day) && x.employee && x.timeIn && x.timeOut)
      .map(x => ({
        id: x.id || uid(),
        employee: String(x.employee),
        day: x.day,
        timeIn: x.timeIn,
        timeOut: x.timeOut,
        notes: x.notes ? String(x.notes) : "",
        createdAt: x.createdAt || new Date().toISOString(),
      }));

    const ok = confirm(`Import ${cleaned.length} entries into this device? (This will ADD to current entries.)`);
    if (!ok) return;

    state.entries = state.entries.concat(cleaned);
    saveState();
    render();
  } catch (err) {
    alert("Import failed. Make sure it's a valid JSON file.");
  } finally {
    els.importFile.value = "";
  }
});

/* ---------- Init ---------- */
render();
