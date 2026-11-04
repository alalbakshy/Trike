const COMPONENTS = {
  SEAT: "Seat",
  MOTOR: "Motor assembly",
  HANDLEBAR: "Handlebars",
  FORK: "Front fork",
  TANK: "Tank cover",
  CHASSIS: "Side chassis",
  FENDER: "Rear fender",
  WHEEL: "Wheel set",
  FASTENER: "Fastener kit"
};

const STEP_CONFIG = {
  receive: { number: 1, hint: "Scan the carton label." },
  prepare: { number: 2, hint: "Scan the prepared bin label." },
  inspect: { number: 3, hint: "Scan the finished-trike ID." }
};

const STORAGE_KEY = "trikeflow-barcode-demo-v2";
let currentStep = "receive";
let state = loadState();

const el = id => document.getElementById(id);
const barcodeInput = el("barcodeInput");

function blankState() {
  const inventory = {};
  Object.keys(COMPONENTS).forEach(key => inventory[key] = { received: 0, available: 0, prepared: 0 });
  return { receivedCount: 0, preparedCount: 0, passedCount: 0, reworkCount: 0, inventory, bins: {}, trikes: {}, log: [], updatedAt: null };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && saved.inventory ? saved : blankState();
  } catch (_) { return blankState(); }
}

function persist() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function cleanCode(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function parseComponent(code) {
  const parts = code.split("-");
  const key = parts[1];
  return COMPONENTS[key] ? key : null;
}

function setMessage(type, title, detail) {
  const box = el("message");
  box.className = `message ${type || ""}`;
  box.querySelector(".message-icon").textContent = type === "success" ? "✓" : type === "error" ? "!" : "i";
  box.querySelector("b").textContent = title;
  box.querySelector("p").textContent = detail;
}

function addLog(step, code, detail) {
  state.log.unshift({ id: `${Date.now()}-${Math.random()}`, step: STEP_CONFIG[step].number, stepName: step, code, detail, time: new Date().toISOString() });
  state.log = state.log.slice(0, 100);
}

function validateFormat(code, step) {
  if (step === "receive") return /^CTN-[A-Z]+-\d{3}$/.test(code);
  if (step === "prepare") return /^BIN-[A-Z]+-\d{2}$/.test(code);
  return /^TRK-\d{4}$/.test(code);
}

function processScan() {
  const code = cleanCode(barcodeInput.value);
  if (!code) return setMessage("error", "No barcode detected", "Scan a label or type a code before recording the scan.");
  if (!validateFormat(code, currentStep)) return setMessage("error", "Scan not recorded", "Use the sample label for the selected scan point.");

  if (currentStep === "receive") receiveCarton(code);
  if (currentStep === "prepare") prepareBin(code);
  if (currentStep === "inspect") inspectTrike(code);
}

function receiveCarton(code) {
  const component = parseComponent(code);
  const qty = Number(el("quantityInput").value);
  if (!component) return setMessage("error", "Unknown component code", "Use one of the component names shown in the inventory table, such as WHEEL.");
  if (!Number.isFinite(qty) || qty < 1) return setMessage("error", "Invalid quantity", "Enter a carton quantity greater than zero.");
  state.inventory[component].received += qty;
  state.inventory[component].available += qty;
  state.receivedCount += 1;
  addLog("receive", code, `${qty} ${COMPONENTS[component].toLowerCase()} units added to available inventory.`);
  persist();
  finishScan("success", "Scan 1 accepted", `${code}: ${qty} units received and released to component preparation.`);
}

function prepareBin(code) {
  const component = parseComponent(code);
  const qty = Number(el("binQuantityInput").value);
  if (!component) return setMessage("error", "Unknown component code", "Use a valid bin label such as BIN-WHEEL-01.");
  if (!Number.isFinite(qty) || qty < 1) return setMessage("error", "Invalid quantity", "Enter a bin quantity greater than zero.");
  if (state.bins[code]?.status === "prepared") return setMessage("error", "Bin is already prepared", `${code} has already been recorded.`);
  if (state.inventory[component].available < qty) return setMessage("error", "Not enough available material", `Available: ${state.inventory[component].available}. Receive a carton before preparing this bin.`);
  state.inventory[component].available -= qty;
  state.inventory[component].prepared += qty;
  state.bins[code] = { component, qty, status: "prepared", preparedAt: new Date().toISOString() };
  state.preparedCount += 1;
  addLog("prepare", code, `${qty} ${COMPONENTS[component].toLowerCase()} units counted into the bin and reserved.`);
  persist();
  finishScan("success", "Scan 2 accepted", `${code}: bin prepared with ${qty} units and placed in the AMR pickup area.`);
}

function inspectTrike(code) {
  const result = el("inspectionSelect").value;
  if (state.trikes[code]) return setMessage("error", "Trike ID already inspected", `${code} was previously recorded as ${state.trikes[code].result.toUpperCase()}.`);
  state.trikes[code] = { result, time: new Date().toISOString() };
  if (result === "pass") state.passedCount += 1;
  else state.reworkCount += 1;
  const detail = result === "pass" ? "Inspection passed; trike released to packing." : "Inspection failed; trike routed to the rework station.";
  addLog("inspect", code, detail);
  persist();
  finishScan(result === "pass" ? "success" : "error", "Scan 3 accepted", `${code}: ${detail}`);
}

function finishScan(type, title, detail) {
  barcodeInput.value = "";
  setMessage(type, title, detail);
  barcodeInput.focus();
}

function selectStep(step) {
  currentStep = step;
  document.querySelectorAll(".step-button").forEach(button => button.classList.toggle("active", button.dataset.step === step));
  el("quantityField").classList.toggle("hidden", step !== "receive");
  el("binQuantityField").classList.toggle("hidden", step !== "prepare");
  el("inspectionField").classList.toggle("hidden", step !== "inspect");
  el("inputHint").textContent = STEP_CONFIG[step].hint;
  setMessage("", `Ready for Scan ${STEP_CONFIG[step].number}`, step === "receive" ? "Scan an inbound carton label to begin." : step === "prepare" ? "Scan the filled bin at component preparation." : "Select the inspection result and scan the finished-trike ID.");
  barcodeInput.value = "";
  barcodeInput.focus();
}

function render() {
  el("receivedCount").textContent = state.receivedCount;
  el("preparedCount").textContent = state.preparedCount;
  el("passedCount").textContent = state.passedCount;

  el("inventoryBody").innerHTML = Object.entries(COMPONENTS).map(([key, name]) => {
    const item = state.inventory[key] || { received: 0, available: 0, prepared: 0 };
    return `<tr><td>${name}</td><td><span class="qty-pill">${item.received}</span></td><td>${item.available}</td><td>${item.prepared}</td></tr>`;
  }).join("");

  el("updatedLabel").textContent = state.updatedAt ? `Updated ${new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Not yet updated";
  const activity = el("activityList");
  if (!state.log.length) {
    activity.innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div><p>No scans recorded yet.</p><span>Your first receiving scan will appear here.</span></div>`;
  } else {
    activity.innerHTML = state.log.map(item => `<article class="activity-item"><div class="activity-badge">S${item.step}</div><div><strong>${escapeHtml(item.code)}</strong><p>${escapeHtml(item.detail)}</p></div><time>${new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></article>`).join("");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function downloadLog() {
  const rows = [["Timestamp", "Scan point", "Barcode", "Event"]].concat([...state.log].reverse().map(item => [item.time, `Scan ${item.step}`, item.code, item.detail]));
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `trikeflow-scan-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".step-button").forEach(button => button.addEventListener("click", () => selectStep(button.dataset.step)));
el("scanButton").addEventListener("click", processScan);
barcodeInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); processScan(); } });
el("resetButton").addEventListener("click", () => {
  if (!confirm("Clear all demo scans and inventory?")) return;
  state = blankState();
  localStorage.removeItem(STORAGE_KEY);
  render();
  selectStep("receive");
});
el("downloadButton").addEventListener("click", downloadLog);
el("printButton").addEventListener("click", () => window.print());

render();
selectStep("receive");
