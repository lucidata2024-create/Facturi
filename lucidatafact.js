/* lucidatafact.js
   LuciDataFact — Evidența facturilor (FIRESTORE ONLY)
   - CRUD facturi
   - Categorii: Magazine / Locații
   - Notificări: în aplicație + opțional browser (la ziua de trimitere)
   - Filtre, căutare, sortare, selecție în masă
   - Export/Import JSON, Reset demo (în Firestore)
   IMPORTANT: acest fișier rulează ca ES Module (type="module")
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

(() => {
  "use strict";

  /* =========================
     FIREBASE INIT
  ========================= */
  

  const app = initializeApp(firebaseConfig);
  try { getAnalytics(app); } catch { /* analytics optional */ }
  const db = getFirestore(app);

  /* =========================
     HELPERS
  ========================= */
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const toISO = (d) => new Date(d).toISOString().slice(0, 10);
  const parseNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));

  const uid = () => "inv_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

  /* =========================
     APP STORAGE (Firestore docs)
     - meta/app => { notifEnabled, lastNotifDay, createdAt, updatedAt }
     - meta/categories => { shops:[], locations:[], updatedAt }
     - invoices/{docId} => invoice fields
  ========================= */
  const REFS = {
    metaApp: doc(db, "meta", "app"),
    metaCategories: doc(db, "meta", "categories"),
    invoices: collection(db, "invoices"),
  };

  /* =========================
     STATE (in-memory, synced from Firestore)
  ========================= */
  const STATE = {
    metaApp: { notifEnabled: false, lastNotifDay: "" },
    categories: { shops: [], locations: [] },
    invoices: [],

    // view
    selected: new Set(),
    filtered: []
  };

  /* =========================
     DOM
  ========================= */
  const $ = (q) => document.querySelector(q);

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

  function validateInvoice(data) {
    const req = ["number", "client", "issueDate", "sendDate", "dueDate", "shop", "location"];
    for (const k of req) {
      if (!String(data[k] || "").trim()) return `Câmp obligatoriu lipsă: ${k}`;
    }
    if (parseNum(data.amount) <= 0) return "Suma trebuie să fie > 0.";
    if (data.issueDate > data.dueDate) return "Data emiterii nu poate fi după scadență.";
    return "";
  }

  function dateBadge(inv) {
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

  /* =========================
     FIRESTORE OPS
  ========================= */

  async function ensureMetaDocsExist() {
    // meta/app
    const appSnap = await getDoc(REFS.metaApp);
    if (!appSnap.exists()) {
      await setDoc(REFS.metaApp, {
        notifEnabled: false,
        lastNotifDay: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // meta/categories
    const catSnap = await getDoc(REFS.metaCategories);
    if (!catSnap.exists()) {
      await setDoc(REFS.metaCategories, {
        shops: ["Magazin București 1", "Magazin Constanța 1", "Depozit Central"],
        locations: ["București", "Constanța", "Ilfov"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // invoices seed (doar dacă nu există niciuna)
    const invQ = query(REFS.invoices, orderBy("createdAt", "desc"));
    let hasAny = false;
    const unsub = onSnapshot(invQ, (snap) => {
      hasAny = !snap.empty;
      unsub(); // one-shot
    });
    // mic delay ca să obținem snapshot-ul
    await new Promise((r) => setTimeout(r, 250));
    if (!hasAny) {
      await seedDemoInvoices();
    }
  }

  async function seedDemoInvoices() {
    const today = isoToday();
    const plus = (days) => toISO(new Date(Date.now() + days * 86400000));
    const minus = (days) => toISO(new Date(Date.now() - days * 86400000));

    const demo = [
      {
        id: uid(),
        number: "LDF-2026-001",
        client: "SC Exemplu SRL",
        shop: "Magazin București 1",
        location: "București",
        issueDate: minus(3),
        sendDate: today,
        dueDate: plus(10),
        amount: 1250.5,
        currency: "RON",
        sent: false,
        paid: false,
        paidDate: "",
        paidRef: "",
        notes: "De trimis azi, apoi urmărire încasare.",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
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
        notes: "Întârziată — necesar reminder.",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
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
        notes: "Încasată.",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    ];

    const batch = writeBatch(db);
    for (const inv of demo) {
      const ref = doc(REFS.invoices); // auto id
      batch.set(ref, inv);
    }
    await batch.commit();
  }

  async function setNotifEnabledFirestore(v) {
    await setDoc(REFS.metaApp, { notifEnabled: !!v, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function setLastNotifDayFirestore(dayISO) {
    await setDoc(REFS.metaApp, { lastNotifDay: dayISO, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function upsertInvoiceFirestore(inv, docId = null) {
    const err = validateInvoice(inv);
    if (err) {
      toast("Validare eșuată", err);
      return false;
    }

    const payload = {
      ...inv,
      amount: parseNum(inv.amount),
      sent: !!inv.sent,
      paid: !!inv.paid,
      updatedAt: serverTimestamp()
    };

    if (docId) {
      await updateDoc(doc(REFS.invoices, docId), payload);
    } else {
      await addDoc(REFS.invoices, { ...payload, createdAt: serverTimestamp() });
    }
    return true;
  }

  async function deleteInvoiceFirestore(docId) {
    await deleteDoc(doc(REFS.invoices, docId));
  }

  async function saveCategoriesFirestore(nextCats) {
    await setDoc(REFS.metaCategories, {
      shops: nextCats.shops || [],
      locations: nextCats.locations || [],
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  async function resetAllFirestore() {
    // șterge toate facturile + re-seed + reset meta
    const invSnap = await new Promise((resolve) => {
      const qInv = query(REFS.invoices, orderBy("createdAt", "desc"));
      const unsub = onSnapshot(qInv, (snap) => { unsub(); resolve(snap); });
    });

    const batch = writeBatch(db);
    invSnap.forEach((d) => batch.delete(d.ref));
    batch.set(REFS.metaApp, { notifEnabled: false, lastNotifDay: "", updatedAt: serverTimestamp() }, { merge: true });
    batch.set(REFS.metaCategories, {
      shops: ["Magazin București 1", "Magazin Constanța 1", "Depozit Central"],
      locations: ["București", "Constanța", "Ilfov"],
      updatedAt: serverTimestamp()
    }, { merge: true });

    await batch.commit();
    await seedDemoInvoices();
  }

  /* =========================
     FILTERS / VIEW
  ========================= */
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

    let list = STATE.invoices.slice();

    if (f.q) {
      list = list.filter(inv => {
        const blob = [
          inv.number, inv.client, inv.shop, inv.location, inv.notes, inv.paidRef
        ].join(" ").toLowerCase();
        return blob.includes(f.q);
      });
    }

    if (f.shop !== "all") list = list.filter(inv => inv.shop === f.shop);
    if (f.location !== "all") list = list.filter(inv => inv.location === f.location);

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

    // sort (în UI)
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

    STATE.filtered = list;
  }

  /* =========================
     RENDER
  ========================= */
  function render() {
    applyFilters();
    renderKpis();
    renderCategorySelects();
    renderTable();
    renderCountHint();
    refreshNotifHint();
  }

  function renderCountHint() {
    els.countHint.textContent = `${STATE.filtered.length} rezultate`;
  }

  function renderKpis() {
    const today = isoToday();
    const plusDays = (d) => {
      const x = new Date();
      x.setDate(x.getDate() + d);
      return toISO(x);
    };
    const soon = plusDays(7);

    const unpaid = STATE.invoices.filter(i => !i.paid);
    const unpaidSum = unpaid.reduce((s,i) => s + (i.amount||0), 0);

    const toSendToday = STATE.invoices.filter(i => !i.sent && i.sendDate === today).length;
    const dueSoon = STATE.invoices.filter(i => !i.paid && i.dueDate >= today && i.dueDate <= soon).length;
    const overdue = STATE.invoices.filter(i => !i.paid && i.dueDate < today).length;

    els.kpiUnpaid.textContent = String(unpaid.length);
    els.kpiUnpaidSum.textContent = fmtMoney(unpaidSum);
    els.kpiToSendToday.textContent = String(toSendToday);
    els.kpiDueSoon.textContent = String(dueSoon);
    els.kpiOverdue.textContent = String(overdue);
  }

  function renderTable() {
    const list = STATE.filtered;
    els.tbody.innerHTML = "";

    els.empty.hidden = STATE.invoices.length !== 0;
    if (list.length === 0) return;

    for (const inv of list) {
      const tr = document.createElement("tr");

      const checked = STATE.selected.has(inv._docId);
      const today = isoToday();
      const overdue = !inv.paid && inv.dueDate && inv.dueDate < today;
      const toSendToday = !inv.sent && inv.sendDate === today;

      tr.innerHTML = `
        <td class="col-check">
          <input type="checkbox" class="rowCheck" data-id="${escapeHtml(inv._docId)}" ${checked ? "checked" : ""} />
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
        <td><div class="money">${fmtMoney(inv.amount || 0)}</div></td>
        <td><span class="badge ${toSendToday ? "warn" : "info"}">📅 ${escapeHtml(inv.sendDate || "-")}</span></td>
        <td><span class="badge ${overdue ? "bad" : "info"}">⏰ ${escapeHtml(inv.dueDate || "-")}</span></td>
        <td>${dateBadge(inv)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="iconbtn btnEdit" data-id="${escapeHtml(inv._docId)}" title="Editează">✏️</button>
            <button class="iconbtn btnToggleSent" data-id="${escapeHtml(inv._docId)}" title="Toggle trimisă">${inv.sent ? "📤" : "📭"}</button>
            <button class="iconbtn btnTogglePaid" data-id="${escapeHtml(inv._docId)}" title="Toggle plătită">${inv.paid ? "✅" : "💳"}</button>
          </div>
        </td>
      `;
      els.tbody.appendChild(tr);
    }

    const allIds = list.map(i => i._docId);
    const allSelected = allIds.length > 0 && allIds.every(id => STATE.selected.has(id));
    els.checkAll.checked = allSelected;
    els.checkAll.indeterminate = !allSelected && allIds.some(id => STATE.selected.has(id));
  }

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
      if (includeAll) sel.value = items.includes(cur) ? cur : "all";
    };

    fill(els.filterShop, STATE.categories.shops || [], true);
    fill(els.filterLocation, STATE.categories.locations || [], true);

    // Invoice modal selects
    const fillReq = (sel, items) => {
      const cur = sel.value;
      sel.innerHTML = "";
      for (const name of items) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
      // păstrăm selecția dacă există
      if (items.includes(cur)) sel.value = cur;
    };

    fillReq(els.invShop, STATE.categories.shops || []);
    fillReq(els.invLocation, STATE.categories.locations || []);
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
    (STATE.categories.shops || []).forEach(s => els.shopList.appendChild(makeLi(s, "shop")));

    els.locationList.innerHTML = "";
    (STATE.categories.locations || []).forEach(l => els.locationList.appendChild(makeLi(l, "location")));
  }

  function refreshNotifHint() {
    const enabled = !!STATE.metaApp.notifEnabled;
    els.notifHint.textContent = enabled
      ? "🔔 Notificările sunt activate (dacă browserul permite)."
      : "🔔 Notificările sunt dezactivate.";
  }

  /* =========================
     CATEGORY LOGIC (Firestore)
  ========================= */
  function categoryInUse(type, name) {
    if (type === "shop") return STATE.invoices.some(i => i.shop === name);
    if (type === "location") return STATE.invoices.some(i => i.location === name);
    return false;
  }

  async function addCategory(type, name) {
    const clean = String(name || "").trim();
    if (!clean) return toast("Nume invalid", "Introduceți un nume pentru categorie.");

    const next = {
      shops: Array.isArray(STATE.categories.shops) ? [...STATE.categories.shops] : [],
      locations: Array.isArray(STATE.categories.locations) ? [...STATE.categories.locations] : []
    };

    const arr = type === "shop" ? next.shops : next.locations;
    if (arr.includes(clean)) return toast("Categorie existentă", "Această categorie există deja.");

    arr.push(clean);
    arr.sort((a,b) => a.localeCompare(b, "ro"));
    await saveCategoriesFirestore(next);
    toast("Categorie adăugată", clean);
  }

  async function deleteCategory(type, name) {
    if (categoryInUse(type, name)) {
      toast("Nu se poate șterge", "Categoria este folosită de una sau mai multe facturi.");
      return;
    }

    const next = {
      shops: Array.isArray(STATE.categories.shops) ? [...STATE.categories.shops] : [],
      locations: Array.isArray(STATE.categories.locations) ? [...STATE.categories.locations] : []
    };

    if (type === "shop") next.shops = next.shops.filter(x => x !== name);
    else next.locations = next.locations.filter(x => x !== name);

    await saveCategoriesFirestore(next);
    toast("Categorie ștearsă", name);
  }

  /* =========================
     INVOICE MODAL
  ========================= */
  function openInvoiceModal(mode, invoice = null) {
    els.invoiceForm.reset();
    els.paidRow.hidden = true;
    els.btnDeleteInvoice.hidden = true;

    renderCategorySelects();

    if (mode === "new") {
      els.modalInvoiceTitle.textContent = "Factură — Adăugare";
      els.invoiceId.value = ""; // _docId în edit
      const today = isoToday();
      els.invIssueDate.value = today;
      els.invSendDate.value = today;
      const due = new Date();
      due.setDate(due.getDate() + 14);
      els.invDueDate.value = toISO(due);
      els.invSent.value = "no";
      els.invPaid.value = "no";

      // default selects
      if (STATE.categories.shops?.length) els.invShop.value = STATE.categories.shops[0];
      if (STATE.categories.locations?.length) els.invLocation.value = STATE.categories.locations[0];

    } else {
      els.modalInvoiceTitle.textContent = "Factură — Editare";
      els.btnDeleteInvoice.hidden = false;

      els.invoiceId.value = invoice._docId; // docId
      els.invNumber.value = invoice.number || "";
      els.invClient.value = invoice.client || "";
      els.invIssueDate.value = invoice.issueDate || "";
      els.invSendDate.value = invoice.sendDate || "";
      els.invDueDate.value = invoice.dueDate || "";
      els.invAmount.value = String(invoice.amount ?? "");
      els.invShop.value = invoice.shop || (STATE.categories.shops?.[0] || "");
      els.invLocation.value = invoice.location || (STATE.categories.locations?.[0] || "");
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

    return {
      id: uid(), // id logic intern (nu docId)
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
  }

  function getInvoiceByDocId(docId) {
    return STATE.invoices.find(x => x._docId === docId) || null;
  }

  /* =========================
     BULK ACTIONS (Firestore batch)
  ========================= */
  function getSelectedIdsInCurrentView() {
    const ids = STATE.filtered.map(x => x._docId);
    return ids.filter(id => STATE.selected.has(id));
  }

  async function bulkMarkSentToday() {
    const ids = getSelectedIdsInCurrentView();
    if (ids.length === 0) return toast("Nimic selectat", "Selectați cel puțin o factură.");

    const today = isoToday();
    const batch = writeBatch(db);

    for (const docId of ids) {
      const inv = getInvoiceByDocId(docId);
      if (!inv) continue;
      batch.update(doc(REFS.invoices, docId), {
        sent: true,
        sendDate: inv.sendDate || today,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    toast("Actualizat", `Trimise: ${ids.length}`);
  }

  async function bulkMarkPaidToday() {
    const ids = getSelectedIdsInCurrentView();
    if (ids.length === 0) return toast("Nimic selectat", "Selectați cel puțin o factură.");

    const today = isoToday();
    const batch = writeBatch(db);

    for (const docId of ids) {
      batch.update(doc(REFS.invoices, docId), {
        paid: true,
        paidDate: today,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    toast("Actualizat", `Plătite: ${ids.length}`);
  }

  async function bulkDeleteSelected() {
    const ids = getSelectedIdsInCurrentView();
    if (ids.length === 0) return toast("Nimic selectat", "Selectați cel puțin o factură.");
    if (!confirm(`Sigur doriți să ștergeți ${ids.length} facturi?`)) return;

    const batch = writeBatch(db);
    for (const docId of ids) batch.delete(doc(REFS.invoices, docId));
    await batch.commit();

    STATE.selected.clear();
    toast("Șterse", `Facturi șterse: ${ids.length}`);
  }

  /* =========================
     EXPORT / IMPORT (Firestore)
  ========================= */
  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "LuciDataFact",
      version: "firestore-v1",
      data: {
        metaApp: STATE.metaApp,
        categories: STATE.categories,
        invoices: STATE.invoices.map(({ _docId, ...rest }) => rest)
      }
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

  async function importJSON(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const data = parsed.data || parsed;

        if (!data || !data.categories || !Array.isArray(data.invoices)) {
          toast("Import eșuat", "Structură JSON invalidă.");
          return;
        }

        // scriem categorii
        await saveCategoriesFirestore({
          shops: Array.isArray(data.categories.shops) ? data.categories.shops : [],
          locations: Array.isArray(data.categories.locations) ? data.categories.locations : []
        });

        // înlocuim toate facturile cu cele din import
        const invSnap = await new Promise((resolve) => {
          const qInv = query(REFS.invoices, orderBy("createdAt", "desc"));
          const unsub = onSnapshot(qInv, (snap) => { unsub(); resolve(snap); });
        });

        const batch = writeBatch(db);
        invSnap.forEach((d) => batch.delete(d.ref));
        for (const inv of data.invoices) {
          const clean = {
            ...inv,
            amount: parseNum(inv.amount),
            sent: !!inv.sent,
            paid: !!inv.paid,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          };
          batch.set(doc(REFS.invoices), clean);
        }
        await batch.commit();

        STATE.selected.clear();
        toast("Import reușit", "Datele au fost încărcate în Firestore.");
      } catch {
        toast("Import eșuat", "Fișier JSON invalid.");
      }
    };
    reader.readAsText(file);
  }

  /* =========================
     NOTIFICATIONS (Firestore meta/app)
  ========================= */
  async function enableBrowserNotifications() {
    try {
      if (!("Notification" in window)) {
        toast("Browser necompatibil", "Notificările nu sunt suportate.");
        return;
      }
      const res = await Notification.requestPermission();
      if (res === "granted") {
        await setNotifEnabledFirestore(true);
        toast("Notificări activate", "Veți primi alerte pentru trimiterea facturilor.");
      } else {
        await setNotifEnabledFirestore(false);
        toast("Notificări dezactivate", "Permisiunea nu a fost acordată.");
      }
    } catch {
      toast("Eroare", "Nu s-a putut activa sistemul de notificări.");
    }
  }

  async function runDailyNotifCheck() {
    // o singură dată pe zi (la încărcare), stocat în Firestore
    const today = isoToday();
    const last = STATE.metaApp.lastNotifDay || "";
    if (last === today) return;

    await setLastNotifDayFirestore(today);

    const due = STATE.invoices.filter(i => !i.sent && i.sendDate === today);
    if (due.length === 0) return;

    toast("Atenție", `Aveți ${due.length} facturi de trimis azi.`);

    if (STATE.metaApp.notifEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification("LuciDataFact — Facturi de trimis azi", {
        body: `Aveți ${due.length} facturi programate pentru trimitere astăzi.`
      });
    }
  }

  /* =========================
     EVENTS (UI)
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
    els.invoiceForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const docId = (els.invoiceId.value || "").trim(); // în edit este _docId
      const inv = readInvoiceForm();

      // dacă edităm, păstrăm id-ul logic din doc existent (dacă există)
      if (docId) {
        const existing = getInvoiceByDocId(docId);
        if (existing?.id) inv.id = existing.id;
      }

      const ok = await upsertInvoiceFirestore(inv, docId || null);
      if (ok) {
        toast("Salvat", `${inv.number} · ${inv.client}`);
        closeModal(els.modalInvoice);
      }
    });

    // delete invoice from modal
    els.btnDeleteInvoice.addEventListener("click", async () => {
      const docId = (els.invoiceId.value || "").trim();
      if (!docId) return;

      const inv = getInvoiceByDocId(docId);
      if (!inv) return;

      if (!confirm(`Ștergeți factura ${inv.number}?`)) return;
      await deleteInvoiceFirestore(docId);
      STATE.selected.delete(docId);
      toast("Șters", "Factura a fost eliminată.");
      closeModal(els.modalInvoice);
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
    els.btnAddShop.addEventListener("click", async () => {
      await addCategory("shop", els.newShopName.value);
      els.newShopName.value = "";
      els.newShopName.focus();
    });
    els.btnAddLocation.addEventListener("click", async () => {
      await addCategory("location", els.newLocationName.value);
      els.newLocationName.value = "";
      els.newLocationName.focus();
    });

    // delete categories (delegation)
    els.shopList.addEventListener("click", async (e) => {
      const btn = e.target.closest("button.del");
      if (!btn) return;
      await deleteCategory(btn.dataset.type, btn.dataset.name);
    });
    els.locationList.addEventListener("click", async (e) => {
      const btn = e.target.closest("button.del");
      if (!btn) return;
      await deleteCategory(btn.dataset.type, btn.dataset.name);
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
    els.btnReset.addEventListener("click", async () => {
      if (!confirm("Resetare completă? Se vor pierde datele curente din Firestore.")) return;
      await resetAllFirestore();
      STATE.selected.clear();
      toast("Reset realizat", "Date demo încărcate în Firestore.");
    });

    // table selection
    els.checkAll.addEventListener("change", () => {
      const ids = STATE.filtered.map(x => x._docId);
      if (els.checkAll.checked) ids.forEach(id => STATE.selected.add(id));
      else ids.forEach(id => STATE.selected.delete(id));
      renderTable();
    });

    // table actions delegation
    els.tbody.addEventListener("click", async (e) => {
      const edit = e.target.closest(".btnEdit");
      const togSent = e.target.closest(".btnToggleSent");
      const togPaid = e.target.closest(".btnTogglePaid");

      if (edit) {
        const inv = getInvoiceByDocId(edit.dataset.id);
        if (inv) openInvoiceModal("edit", inv);
        return;
      }

      if (togSent) {
        const docId = togSent.dataset.id;
        const inv = getInvoiceByDocId(docId);
        if (!inv) return;
        await updateDoc(doc(REFS.invoices, docId), {
          sent: !inv.sent,
          updatedAt: serverTimestamp()
        });
        toast("Actualizat", (!inv.sent) ? "Factura marcată ca trimisă." : "Factura marcată ca netrimisă.");
        return;
      }

      if (togPaid) {
        const docId = togPaid.dataset.id;
        const inv = getInvoiceByDocId(docId);
        if (!inv) return;

        const nextPaid = !inv.paid;
        await updateDoc(doc(REFS.invoices, docId), {
          paid: nextPaid,
          paidDate: nextPaid ? isoToday() : "",
          paidRef: nextPaid ? (inv.paidRef || "") : "",
          updatedAt: serverTimestamp()
        });

        toast("Actualizat", nextPaid ? "Factura marcată ca plătită." : "Factura marcată ca neplătită.");
        return;
      }
    });

    els.tbody.addEventListener("change", (e) => {
      const cb = e.target.closest(".rowCheck");
      if (!cb) return;
      const id = cb.dataset.id;
      if (cb.checked) STATE.selected.add(id);
      else STATE.selected.delete(id);
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
     REALTIME SUBSCRIPTIONS
  ========================= */
  function subscribe() {
    // meta/app
    onSnapshot(REFS.metaApp, (snap) => {
      const d = snap.data() || {};
      STATE.metaApp = {
        notifEnabled: !!d.notifEnabled,
        lastNotifDay: d.lastNotifDay || ""
      };
      refreshNotifHint();
    });

    // categories
    onSnapshot(REFS.metaCategories, (snap) => {
      const d = snap.data() || {};
      STATE.categories = {
        shops: Array.isArray(d.shops) ? d.shops : [],
        locations: Array.isArray(d.locations) ? d.locations : []
      };
      renderCategorySelects();
      if (els.modalCategory.classList.contains("show")) renderCategoryLists();
      render(); // re-render ca să reflecte filtrele/select-urile
    });

    // invoices (realtime)
    const qInv = query(REFS.invoices, orderBy("createdAt", "desc"));
    onSnapshot(qInv, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        const inv = docSnap.data() || {};
        list.push({ ...inv, _docId: docSnap.id });
      });

      STATE.invoices = list;

      // curățăm selecțiile care nu mai există
      const existingIds = new Set(list.map(x => x._docId));
      for (const id of Array.from(STATE.selected)) {
        if (!existingIds.has(id)) STATE.selected.delete(id);
      }

      render();
      // daily check după ce avem datele în memorie
      runDailyNotifCheck().catch(() => {});
    });
  }

  /* =========================
     INIT
  ========================= */
  async function init() {
    await ensureMetaDocsExist();
    wire();
    subscribe();
    render();
  }

  init().catch((err) => {
    console.error(err);
    toast("Eroare inițializare", "Verificați consola și configurația Firebase.");
  });

})();
