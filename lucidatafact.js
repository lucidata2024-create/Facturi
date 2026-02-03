(() => {
  "use strict";

  /* =========================
     STORAGE
  ========================= */
  const KEYS = {
    DB: "LDF_DB_v1",
    NOTIF: "LDF_NOTIF_PREF_v1",
    LAST_NOTIF_DAY: "LDF_LAST_NOTIF_DAY_v1"
  };

  const isoToday = () => new Date().toISOString().slice(0, 10);
  const toISO = (d) => new Date(d).toISOString().slice(0, 10);
  const parseNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const uid = () => "inv_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

  const load = () => {
    const raw = localStorage.getItem(KEYS.DB);
    if (!raw) return seed();
    try {
      const db = JSON.parse(raw);
      if (!db || !Array.isArray(db.invoices) || !db.categories) return seed();
      return db;
    } catch {
      return seed();
    }
  };

  const save = () => localStorage.setItem(KEYS.DB, JSON.stringify(DB));

  const seed = () => {
    const today = isoToday();
    const plus = (days) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return toISO(d);
    };
    const minus = (days) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return toISO(d);
    };

    return {
      categories: {
        shops: ["Magazin București 1", "Magazin Constanța 1", "Depozit Central"],
        locations: ["București", "Constanța", "Ilfov"]
      },
      invoices: [
        {
          id: uid(),
          number: "LDF-2026-001",
          client: "SC Exemplu SRL",
          shop: "Magazin București 1",
          location: "București",
          issueDate: minus(3),
          sendDate: today,
          dueDate: plus(10),
          amount: 1250.50,
          currency: "RON",
          sent: false,
          paid: false,
          paidDate: "",
          paidRef: "",
          notes: "De trimis azi, apoi urmărire încasare."
        },
        {
          id: uid(),
          number: "LDF-2026-002",
          client: "Company Retail SA",
          shop: "Magazin Constanța 1",
          location: "Constanța",
          issueDate: minus(14),
          sendDate: minus(12),
          dueDate: minus(1),
          amount: 3890,
          currency: "RON",
          sent: true,
          paid: false,
          paidDate: "",
          paidRef: "",
          notes: "Întârziată — necesar reminder."
        },
        {
          id: uid(),
          number: "LDF-2026-003",
          client: "Distribuitor XYZ",
          shop: "Depozit Central",
          location: "Ilfov",
          issueDate: minus(20),
          sendDate: minus(19),
          dueDate: minus(5),
          amount: 7600,
          currency: "RON",
          sent: true,
          paid: true,
          paidDate: minus(4),
          paidRef: "OP #10492",
          notes: "Încasată."
        }
      ]
    };
  };

  let DB = load();

  /* =========================
     DOM
  ========================= */
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));

  const els = {
    // top
    btnAddInvoice: $("#btnAddInvoice"),
    btnAddInvoiceEmpty: $("#btnAddInvoiceEmpty"),
    btnAddCategory: $("#btnAddCategory"),
    btnEnableNotifs: $("#btnEnableNotifs"),
    btnExport: $("#btnExport"),
    importFile: $("#importFile"),
    btnReset: $("#btnReset"),

    // kpis
    kpiUnpaid: $("#kpiUnpaid"),
    kpiUnpaidSum: $("#kpiUnpaidSum"),
    kpiToSendToday: $("#kpiToSendToday"),
    kpiDueSoon: $("#kpiDueSoon"),
    kpiOverdue: $("#kpiOverdue"),

    // filters
    search: $("#search"),
    filterStatus: $("#filterStatus"),
    filterShop: $("#filterShop"),
    filterLocation: $("#filterLocation"),
    sortBy: $("#sortBy"),
    btnClearFilters: $("#btnClearFilters"),
    notifHint: $("#notifHint"),
    countHint: $("#countHint"),

    // table
    tbody: $("#invoiceTbody"),
    empty: $("#emptyState"),
    checkAll: $("#checkAll"),
    btnMarkSendToday: $("#btnMarkSendToday"),
    btnMarkPaidToday: $("#btnMarkPaidToday"),
    btnDeleteSelected: $("#btnDeleteSelected"),

    // modal invoice
    modalInvoice: $("#modalInvoice"),
    btnCloseInvoice: $("#btnCloseInvoice"),
    btnCancelInvoice: $("#btnCancelInvoice"),
    invoiceForm: $("#invoiceForm"),
    invoiceId: $("#invoiceId"),
    invNumber: $("#invNumber"),
    invClient: $("#invClient"),
    invIssueDate: $("#invIssueDate"),
    invSendDate: $("#invSendDate"),
    invDueDate: $("#invDueDate"),
    invAmount: $("#invAmount"),
    invShop: $("#invShop"),
    invLocation: $("#invLocation"),
    invSent: $("#invSent"),
    invPaid: $("#invPaid"),
    paidRow: $("#paidRow"),
    invPaidDate: $("#invPaidDate"),
    invPaidRef: $("#invPaidRef"),
    invNotes: $("#invNotes"),
    btnDeleteInvoice: $("#btnDeleteInvoice"),
    modalInvoiceTitle: $("#modalInvoiceTitle"),

    // modal category
    modalCategory: $("#modalCategory"),
    btnCloseCategory: $("#btnCloseCategory"),
    btnDoneCategory: $("#btnDoneCategory"),
    newShopName: $("#newShopName"),
    btnAddShop: $("#btnAddShop"),
    shopList: $("#shopList"),
    newLocationName: $("#newLocationName"),
    btnAddLocation: $("#btnAddLocation"),
    locationList: $("#locationList"),

    // toast
    toastHost: $("#toastHost")
  };

  /* =========================
     UI HELPERS
  ========================= */
  function toast(title, subtitle = "") {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <div class="t">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="s">${escapeHtml(subtitle)}</div>` : ""}
    `;
    els.toastHost.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      el.style.transition = "all .25s ease";
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function openModal(modalEl) {
    modalEl.classList.add("show");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(modalEl) {
    modalEl.classList.remove("show");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function fmtMoney(n) {
    const v = Number(n || 0);
    return v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
  }

  function dateBadge(inv) {
    // status combinat: (trimis / netrimis) + (platit / neplatit) + overdue
    const today = isoToday();
    const overdue = !inv.paid && inv.dueDate && inv.dueDate < today;
    const toSendToday = !inv.sent && inv.sendDate === today;

    const parts = [];
    if (inv.paid) parts.push(`<span class="badge good">✅ Plătită</span>`);
    else parts.push(`<span class="badge warn">⏳ Neplătită</span>`);

    if (inv.sent) parts.push(`<span class="badge info">📤 Trimisa</span>`);
    else parts.push(`<span class="badge ${toSendToday ? "warn" : ""}">📭 Netrimisă</span>`);

    if (overdue) parts.push(`<span class="badge bad">⚠️ Întârziată</span>`);
    return parts.join(" ");
  }

  function validateInvoice(data) {
    const req = ["number", "client", "issueDate", "sendDate", "dueDate", "shop", "location"];
    for (const k of req) {
      if (!String(data[k] || "").trim()) return `Câmp obligatoriu lipsă: ${k}`;
    }
    if (parseNum(data.amount) <= 0) return "Suma trebuie să fie > 0.";
    if (data.issueDate > data.dueDate) return "Data emiterii nu poate fi după scadență.";
    return "";
  }

  /* =========================
     FILTERS / VIEW
  ========================= */
  const view = {
    selected: new Set(),
    filtered: []
  };

  function readFilters() {
    return {
      q: (els.search.value || "").trim().toLowerCase(),
      status: els.filterStatus.value,
      shop: els.filterShop.value,
      location: els.filterLocation.value,
      sort: els.sortBy.value
    };
  }

  function applyFilters() {
    const f = readFilters();
    const today = isoToday();

    let list = DB.invoices.slice();

    // text search
    if (f.q) {
      list = list.filter(inv => {
        const blob = [
          inv.number, inv.client, inv.shop, inv.location, inv.notes, inv.paidRef
        ].join(" ").toLowerCase();
        return blob.includes(f.q);
      });
    }

    // shop/location
    if (f.shop !== "all") list = list.filter(inv => inv.shop === f.shop);
    if (f.location !== "all") list = list.filter(inv => inv.location === f.location);

    // status
    if (f.status !== "all") {
      list = list.filter(inv => {
        const overdue = !inv.paid && inv.dueDate && inv.dueDate < today;
        if (f.status === "unpaid") return !inv.paid;
        if (f.status === "paid") return inv.paid;
        if (f.status === "unsent") return !inv.sent;
        if (f.status === "sent") return inv.sent;
        if (f.status === "overdue") return overdue;
        return true;
      });
    }

    // sort
    const get = (inv, key) => inv[key] || "";
    const sorters = {
      sendDate_asc: (a,b) => get(a,"sendDate").localeCompare(get(b,"sendDate")),
      sendDate_desc: (a,b) => get(b,"sendDate").localeCompare(get(a,"sendDate")),
      dueDate_asc: (a,b) => get(a,"dueDate").localeCompare(get(b,"dueDate")),
      dueDate_desc: (a,b) => get(b,"dueDate").localeCompare(get(a,"dueDate")),
      issueDate_desc: (a,b) => get(b,"issueDate").localeCompare(get(a,"issueDate")),
      amount_desc: (a,b) => (b.amount||0) - (a.amount||0),
      amount_asc: (a,b) => (a.amount||0) - (b.amount||0),
    };
    list.sort(sorters[f.sort] || sorters.sendDate_asc);

    view.filtered = list;
  }

  function render() {
    applyFilters();
    renderKpis();
    renderTable();
    renderCountHint();
    refreshNotifHint();
  }

  function renderCountHint() {
    els.countHint.textContent = `${view.filtered.length} rezultate`;
  }

  function renderKpis() {
    const today = isoToday();
    const plusDays = (d) => {
      const x = new Date();
      x.setDate(x.getDate() + d);
      return toISO(x);
    };
    const soon = plusDays(7);

    const unpaid = DB.invoices.filter(i => !i.paid);
    const unpaidSum = unpaid.reduce((s,i) => s + (i.amount||0), 0);

    const toSendToday = DB.invoices.filter(i => !i.sent && i.sendDate === today).length;
    const dueSoon = DB.invoices.filter(i => !i.paid && i.dueDate >= today && i.dueDate <= soon).length;
    const overdue = DB.invoices.filter(i => !i.paid && i.dueDate < today).length;

    els.kpiUnpaid.textContent = String(unpaid.length);
    els.kpiUnpaidSum.textContent = fmtMoney(unpaidSum);
    els.kpiToSendToday.textContent = String(toSendToday);
    els.kpiDueSoon.textContent = String(dueSoon);
    els.kpiOverdue.textContent = String(overdue);
  }

  function renderTable() {
    const list = view.filtered;
    els.tbody.innerHTML = "";

    els.empty.hidden = DB.invoices.length !== 0;

    if (list.length === 0) {
      // dacă avem facturi dar filtrul golește lista, arătăm tabel gol (fără empty state global)
      return;
    }

    for (const inv of list) {
      const tr = document.createElement("tr");

      const checked = view.selected.has(inv.id);
      const today = isoToday();
      const overdue = !inv.paid && inv.dueDate && inv.dueDate < today;
      const toSendToday = !inv.sent && inv.sendDate === today;

      tr.innerHTML = `
        <td class="col-check">
          <input type="checkbox" class="rowCheck" data-id="${escapeHtml(inv.id)}" ${checked ? "checked" : ""} />
        </td>
        <td>
          <div style="font-weight:850">${escapeHtml(inv.number)}</div>
          <div class="smalltxt">Emisă: ${escapeHtml(inv.issueDate || "-")}</div>
        </td>
        <td>
          <div style="font-weight:750">${escapeHtml(inv.client)}</div>
          ${inv.notes ? `<div class="smalltxt">${escapeHtml(inv.notes)}</div>` : `<div class="smalltxt">—</div>`}
        </td>
        <td>${escapeHtml(inv.shop)}</td>
        <td>${escapeHtml(inv.location)}</td>
        <td>
          <div class="money">${fmtMoney(inv.amount || 0)}</div>
        </td>
        <td>
          <span class="badge ${toSendToday ? "warn" : "info"}">📅 ${escapeHtml(inv.sendDate || "-")}</span>
        </td>
        <td>
          <span class="badge ${overdue ? "bad" : "info"}">⏰ ${escapeHtml(inv.dueDate || "-")}</span>
        </td>
        <td>${dateBadge(inv)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="iconbtn btnEdit" data-id="${escapeHtml(inv.id)}" title="Editează">✏️</button>
            <button class="iconbtn btnToggleSent" data-id="${escapeHtml(inv.id)}" title="Toggle trimisă">${inv.sent ? "📤" : "📭"}</button>
            <button class="iconbtn btnTogglePaid" data-id="${escapeHtml(inv.id)}" title="Toggle plătită">${inv.paid ? "✅" : "💳"}</button>
          </div>
        </td>
      `;
      els.tbody.appendChild(tr);
    }

    // checkAll reflect
    const allIds = list.map(i => i.id);
    const allSelected = allIds.length > 0 && allIds.every(id => view.selected.has(id));
    els.checkAll.checked = allSelected;
    els.checkAll.indeterminate = !allSelected && allIds.some(id => view.selected.has(id));
  }

  /* =========================
     CATEGORIES
  ========================= */
  function renderCategorySelects() {
    // Filters
    const fill = (sel, items, includeAll = true) => {
      const cur = sel.value;
      sel.innerHTML = includeAll ? `<option value="all">Toate</option>` : "";
      for (const name of items) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
      // restore if possible
      if (includeAll) {
        sel.value = items.includes(cur) ? cur : "all";
      }
    };

    fill(els.filterShop, DB.categories.shops, true);
    fill(els.filterLocation, DB.categories.locations, true);

    // Invoice modal (required)
    const fillReq = (sel, items) => {
      sel.innerHTML = "";
      for (const name of items) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
    };
    fillReq(els.invShop, DB.categories.shops);
    fillReq(els.invLocation, DB.categories.locations);
  }

  function renderCategoryLists() {
    const makeLi = (name, type) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="name">${escapeHtml(name)}</div>
        <button class="btn btn-danger del" data-type="${type}" data-name="${escapeHtml(name)}">Șterge</button>
      `;
      return li;
    };
    els.shopList.innerHTML = "";
    for (const s of DB.categories.shops) els.shopList.appendChild(makeLi(s, "shop"));

    els.locationList.innerHTML = "";
    for (const l of DB.categories.locations) els.locationList.appendChild(makeLi(l, "location"));
  }

  function categoryInUse(type, name) {
    if (type === "shop") return DB.invoices.some(i => i.shop === name);
    if (type === "location") return DB.invoices.some(i => i.location === name);
    return false;
  }

  function addCategory(type, name) {
    const clean = String(name || "").trim();
    if (!clean) return toast("Nume invalid", "Introduceți un nume pentru categorie.");
    const arr = type === "shop" ? DB.categories.shops : DB.categories.locations;
    if (arr.includes(clean)) return toast("Categorie existentă", "Această categorie există deja.");
    arr.push(clean);
    arr.sort((a,b) => a.localeCompare(b, "ro"));
    save();
    renderCategorySelects();
    renderCategoryLists();
    toast("Categorie adăugată", clean);
  }

  function deleteCategory(type, name) {
    if (categoryInUse(type, name)) {
      toast("Nu se poate șterge", "Categoria este folosită de una sau mai multe facturi.");
      return;
    }
    const key = type === "shop" ? "shops" : "locations";
    DB.categories[key] = DB.categories[key].filter(x => x !== name);
    save();
    renderCategorySelects();
    renderCategoryLists();
    toast("Categorie ștearsă", name);
  }

  /* =========================
     INVOICE MODAL
  ========================= */
  function openInvoiceModal(mode, invoice = null) {
    els.invoiceForm.reset();
    els.paidRow.hidden = true;
    els.btnDeleteInvoice.hidden = true;

    renderCategorySelects(); // ensures selects are filled

    if (mode === "new") {
      els.modalInvoiceTitle.textContent = "Factură — Adăugare";
      els.invoiceId.value = "";
      const today = isoToday();
      els.invIssueDate.value = today;
      els.invSendDate.value = today;
      // default due in 14 days
      const due = new Date();
      due.setDate(due.getDate() + 14);
      els.invDueDate.value = toISO(due);
      els.invSent.value = "no";
      els.invPaid.value = "no";
    } else {
      els.modalInvoiceTitle.textContent = "Factură — Editare";
      els.btnDeleteInvoice.hidden = false;

      els.invoiceId.value = invoice.id;
      els.invNumber.value = invoice.number || "";
      els.invClient.value = invoice.client || "";
      els.invIssueDate.value = invoice.issueDate || "";
      els.invSendDate.value = invoice.sendDate || "";
      els.invDueDate.value = invoice.dueDate || "";
      els.invAmount.value = String(invoice.amount ?? "");
      els.invShop.value = invoice.shop || DB.categories.shops[0] || "";
      els.invLocation.value = invoice.location || DB.categories.locations[0] || "";
      els.invSent.value = invoice.sent ? "yes" : "no";
      els.invPaid.value = invoice.paid ? "yes" : "no";
      els.invPaidDate.value = invoice.paidDate || "";
      els.invPaidRef.value = invoice.paidRef || "";
      els.invNotes.value = invoice.notes || "";

      els.paidRow.hidden = !invoice.paid;
    }

    openModal(els.modalInvoice);
  }

  function readInvoiceForm() {
    const paidYes = els.invPaid.value === "yes";
    const sentYes = els.invSent.value === "yes";

    const data = {
      id: els.invoiceId.value || uid(),
      number: els.invNumber.value.trim(),
      client: els.invClient.value.trim(),
      issueDate: els.invIssueDate.value,
      sendDate: els.invSendDate.value,
      dueDate: els.invDueDate.value,
      amount: parseNum(els.invAmount.value),
      currency: "RON",
      shop: els.invShop.value,
      location: els.invLocation.value,
      sent: sentYes,
      paid: paidYes,
      paidDate: paidYes ? (els.invPaidDate.value || isoToday()) : "",
      paidRef: paidYes ? els.invPaidRef.value.trim() : "",
      notes: els.invNotes.value.trim()
    };

    // dacă e paid, ensure paidRow shown
    return data;
  }

  function upsertInvoice(inv) {
    const err = validateInvoice(inv);
    if (err) {
      toast("Validare eșuată", err);
      return false;
    }

    const idx = DB.invoices.findIndex(x => x.id === inv.id);
    if (idx >= 0) DB.invoices[idx] = inv;
    else DB.invoices.unshift(inv);

    save();
    toast("Salvat", `${inv.number} · ${inv.client}`);
    return true;
  }

  function deleteInvoice(id) {
    DB.invoices = DB.invoices.filter(x => x.id !== id);
    view.selected.delete(id);
    save();
    toast("Șters", "Factura a fost eliminată.");
  }

  function getById(id) {
    return DB.invoices.find(x => x.id === id) || null;
  }

  /* =========================
     BULK ACTIONS
  ========================= */
  function getSelectedIdsInCurrentView() {
    const ids = view.filtered.map(x => x.id);
    return ids.filter(id => view.selected.has(id));
  }

  function bulkMarkSentToday() {
    const ids = getSelectedIdsInCurrentView();
    if (ids.length === 0) return toast("Nimic selectat", "Selectați cel puțin o factură.");
    const today = isoToday();
    for (const id of ids) {
      const inv = getById(id);
      if (!inv) continue;
      inv.sent = true;
      // opțional: dacă sendDate e gol, setăm azi
      if (!inv.sendDate) inv.sendDate = today;
    }
    save();
    toast("Actualizat", `Trimise: ${ids.length}`);
    render();
  }

  function bulkMarkPaidToday() {
    const ids = getSelectedIdsInCurrentView();
    if (ids.length === 0) return toast("Nimic selectat", "Selectați cel puțin o factură.");
    const today = isoToday();
    for (const id of ids) {
      const inv = getById(id);
      if (!inv) continue;
      inv.paid = true;
      inv.paidDate = today;
    }
    save();
    toast("Actualizat", `Plătite: ${ids.length}`);
    render();
  }

  function bulkDeleteSelected() {
    const ids = getSelectedIdsInCurrentView();
    if (ids.length === 0) return toast("Nimic selectat", "Selectați cel puțin o factură.");
    if (!confirm(`Sigur doriți să ștergeți ${ids.length} facturi?`)) return;
    DB.invoices = DB.invoices.filter(x => !view.selected.has(x.id));
    view.selected.clear();
    save();
    toast("Șterse", `Facturi șterse: ${ids.length}`);
    render();
  }

  /* =========================
     EXPORT / IMPORT / RESET
  ========================= */
  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "LuciDataFact",
      version: "v1",
      data: DB
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LuciDataFact_export_${isoToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Export realizat", "Fișierul a fost descărcat.");
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const data = parsed.data || parsed;
        if (!data || !data.categories || !Array.isArray(data.invoices)) {
          toast("Import eșuat", "Structură JSON invalidă.");
          return;
        }
        DB = data;
        save();
        view.selected.clear();
        renderCategorySelects();
        toast("Import reușit", "Datele au fost încărcate.");
        render();
      } catch {
        toast("Import eșuat", "Fișier JSON invalid.");
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm("Resetare completă? Se vor pierde datele curente.")) return;
    DB = seed();
    save();
    view.selected.clear();
    toast("Reset realizat", "Date demo încărcate.");
    renderCategorySelects();
    render();
  }

  /* =========================
     NOTIFICATIONS
  ========================= */
  function notifEnabled() {
    return localStorage.getItem(KEYS.NOTIF) === "1";
  }
  function setNotifEnabled(v) {
    localStorage.setItem(KEYS.NOTIF, v ? "1" : "0");
  }

  async function enableBrowserNotifications() {
    try {
      if (!("Notification" in window)) {
        toast("Browser necompatibil", "Notificările nu sunt suportate.");
        return;
      }
      const res = await Notification.requestPermission();
      if (res === "granted") {
        setNotifEnabled(true);
        toast("Notificări activate", "Veți primi alerte pentru trimiterea facturilor.");
      } else {
        setNotifEnabled(false);
        toast("Notificări dezactivate", "Permisiunea nu a fost acordată.");
      }
      refreshNotifHint();
    } catch {
      toast("Eroare", "Nu s-a putut activa sistemul de notificări.");
    }
  }

  function refreshNotifHint() {
    const enabled = notifEnabled();
    els.notifHint.textContent = enabled
      ? "🔔 Notificările sunt activate (dacă browserul permite)."
      : "🔔 Notificările sunt dezactivate.";
  }

  function runDailyNotifCheck() {
    // o singură dată pe zi (la încărcare)
    const today = isoToday();
    const last = localStorage.getItem(KEYS.LAST_NOTIF_DAY) || "";
    if (last === today) return;

    localStorage.setItem(KEYS.LAST_NOTIF_DAY, today);

    // notificăm pentru facturile cu sendDate azi și netrimise
    const due = DB.invoices.filter(i => !i.sent && i.sendDate === today);
    if (due.length === 0) return;

    toast("Atenție", `Aveți ${due.length} facturi de trimis azi.`);

    if (notifEnabled() && "Notification" in window && Notification.permission === "granted") {
      const title = "LuciDataFact — Facturi de trimis azi";
      const body = `Aveți ${due.length} facturi programate pentru trimitere astăzi.`;
      new Notification(title, { body });
    }
  }

  /* =========================
     EVENTS
  ========================= */
  function wire() {
    // add invoice
    els.btnAddInvoice.addEventListener("click", () => openInvoiceModal("new"));
    els.btnAddInvoiceEmpty.addEventListener("click", () => openInvoiceModal("new"));

    // close invoice modal
    els.btnCloseInvoice.addEventListener("click", () => closeModal(els.modalInvoice));
    els.btnCancelInvoice.addEventListener("click", () => closeModal(els.modalInvoice));
    els.modalInvoice.addEventListener("click", (e) => { if (e.target === els.modalInvoice) closeModal(els.modalInvoice); });

    // invoice paid toggle row
    els.invPaid.addEventListener("change", () => {
      const isPaid = els.invPaid.value === "yes";
      els.paidRow.hidden = !isPaid;
      if (isPaid && !els.invPaidDate.value) els.invPaidDate.value = isoToday();
      if (!isPaid) { els.invPaidDate.value = ""; els.invPaidRef.value = ""; }
    });

    // save invoice
    els.invoiceForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const inv = readInvoiceForm();
      if (upsertInvoice(inv)) {
        closeModal(els.modalInvoice);
        render();
      }
    });

    // delete invoice from modal
    els.btnDeleteInvoice.addEventListener("click", () => {
      const id = els.invoiceId.value;
      if (!id) return;
      const inv = getById(id);
      if (!inv) return;
      if (!confirm(`Ștergeți factura ${inv.number}?`)) return;
      deleteInvoice(id);
      closeModal(els.modalInvoice);
      render();
    });

    // categories modal
    els.btnAddCategory.addEventListener("click", () => {
      renderCategoryLists();
      openModal(els.modalCategory);
    });
    els.btnCloseCategory.addEventListener("click", () => closeModal(els.modalCategory));
    els.btnDoneCategory.addEventListener("click", () => closeModal(els.modalCategory));
    els.modalCategory.addEventListener("click", (e) => { if (e.target === els.modalCategory) closeModal(els.modalCategory); });

    // add categories
    els.btnAddShop.addEventListener("click", () => {
      addCategory("shop", els.newShopName.value);
      els.newShopName.value = "";
      els.newShopName.focus();
    });
    els.btnAddLocation.addEventListener("click", () => {
      addCategory("location", els.newLocationName.value);
      els.newLocationName.value = "";
      els.newLocationName.focus();
    });

    // delete categories (delegation)
    els.shopList.addEventListener("click", (e) => {
      const btn = e.target.closest("button.del");
      if (!btn) return;
      deleteCategory(btn.dataset.type, btn.dataset.name);
    });
    els.locationList.addEventListener("click", (e) => {
      const btn = e.target.closest("button.del");
      if (!btn) return;
      deleteCategory(btn.dataset.type, btn.dataset.name);
    });

    // filters
    const onFilter = () => render();
    els.search.addEventListener("input", onFilter);
    els.filterStatus.addEventListener("change", onFilter);
    els.filterShop.addEventListener("change", onFilter);
    els.filterLocation.addEventListener("change", onFilter);
    els.sortBy.addEventListener("change", onFilter);

    els.btnClearFilters.addEventListener("click", () => {
      els.search.value = "";
      els.filterStatus.value = "all";
      els.filterShop.value = "all";
      els.filterLocation.value = "all";
      els.sortBy.value = "sendDate_asc";
      render();
    });

    // enable notifications
    els.btnEnableNotifs.addEventListener("click", () => enableBrowserNotifications());

    // export/import/reset
    els.btnExport.addEventListener("click", exportJSON);
    els.importFile.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importJSON(file);
      e.target.value = "";
    });
    els.btnReset.addEventListener("click", resetAll);

    // table selection
    els.checkAll.addEventListener("change", () => {
      const ids = view.filtered.map(x => x.id);
      if (els.checkAll.checked) ids.forEach(id => view.selected.add(id));
      else ids.forEach(id => view.selected.delete(id));
      renderTable();
    });

    // table actions delegation
    els.tbody.addEventListener("click", (e) => {
      const edit = e.target.closest(".btnEdit");
      const togSent = e.target.closest(".btnToggleSent");
      const togPaid = e.target.closest(".btnTogglePaid");

      if (edit) {
        const inv = getById(edit.dataset.id);
        if (inv) openInvoiceModal("edit", inv);
        return;
      }
      if (togSent) {
        const inv = getById(togSent.dataset.id);
        if (!inv) return;
        inv.sent = !inv.sent;
        save();
        toast("Actualizat", inv.sent ? "Factura marcată ca trimisă." : "Factura marcată ca netrimisă.");
        render();
        return;
      }
      if (togPaid) {
        const inv = getById(togPaid.dataset.id);
        if (!inv) return;
        inv.paid = !inv.paid;
        inv.paidDate = inv.paid ? isoToday() : "";
        if (!inv.paid) inv.paidRef = "";
        save();
        toast("Actualizat", inv.paid ? "Factura marcată ca plătită." : "Factura marcată ca neplătită.");
        render();
        return;
      }
    });

    els.tbody.addEventListener("change", (e) => {
      const cb = e.target.closest(".rowCheck");
      if (!cb) return;
      const id = cb.dataset.id;
      if (cb.checked) view.selected.add(id);
      else view.selected.delete(id);
      renderTable();
    });

    // bulk actions
    els.btnMarkSendToday.addEventListener("click", bulkMarkSentToday);
    els.btnMarkPaidToday.addEventListener("click", bulkMarkPaidToday);
    els.btnDeleteSelected.addEventListener("click", bulkDeleteSelected);

    // esc closes modals
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (els.modalInvoice.classList.contains("show")) closeModal(els.modalInvoice);
      if (els.modalCategory.classList.contains("show")) closeModal(els.modalCategory);
    });
  }

  /* =========================
     INIT
  ========================= */
  function init() {
    renderCategorySelects();
    wire();
    render();
    runDailyNotifCheck();
  }

  init();
})();
