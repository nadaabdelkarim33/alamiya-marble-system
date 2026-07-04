const API = "/api/state";
const SESSION_KEY = "alAlamiya.currentUser";
const STATIC_STORAGE_KEY = "alAlamiya.githubPagesState";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let state = null;
let currentUser = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");

function syncPhoneScale() {
  const desktopWidth = 1180;
  const scale = Math.min(window.innerWidth / desktopWidth, 1);
  document.documentElement.style.setProperty("--phone-scale", scale.toFixed(4));
}

syncPhoneScale();
window.addEventListener("resize", syncPhoneScale);
window.addEventListener("orientationchange", syncPhoneScale);

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  pageTitle: document.querySelector("#pageTitle"),
  currentUser: document.querySelector("#currentUser"),
  stats: document.querySelector("#stats"),
  stockAlerts: document.querySelector("#stockAlerts"),
  lateOrders: document.querySelector("#lateOrders"),
  products: document.querySelector("#products"),
  customers: document.querySelector("#customers"),
  documents: document.querySelector("#documents"),
  reports: document.querySelector("#reports"),
  stockProducts: document.querySelector("#stockProducts"),
  orders: document.querySelector("#orders"),
  users: document.querySelector("#users"),
  productDialog: document.querySelector("#productDialog"),
  customerDialog: document.querySelector("#customerDialog")
};

const titles = {
  dashboard: "لوحة التحكم",
  products: "إدارة المنتجات",
  customers: "إدارة العملاء",
  billing: "الفواتير والعروض",
  reports: "التقارير",
  stock: "المخزون والموردين",
  orders: "الطلبات والتركيبات",
  users: "الصلاحيات"
};

const roleText = { admin: "Admin", sales: "موظف مبيعات", stock: "مخزن", accountant: "محاسب" };
const roleViews = {
  admin: ["dashboard", "products", "customers", "billing", "reports", "stock", "orders", "users"],
  sales: ["dashboard", "products", "customers", "billing", "reports", "orders"],
  stock: ["dashboard", "products", "stock", "orders"],
  accountant: ["dashboard", "billing", "reports", "customers"]
};

async function loadState() {
  const savedStaticState = localStorage.getItem(STATIC_STORAGE_KEY);
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error("API is not available");
    state = await res.json();
    return;
  } catch {
    if (savedStaticState) {
      state = JSON.parse(savedStaticState);
      return;
    }
  }

  try {
    const res = await fetch("data/state.json");
    if (!res.ok) throw new Error("Static data file is not available");
    state = await res.json();
  } catch {
    state = {
      products: [],
      customers: [],
      documents: [],
      suppliers: [],
      movements: [],
      orders: [],
      users: [
        { id: "u-admin", username: "ايهاب عبدالعال", name: "م/ إيهاب عبدالعال", password: "123456", role: "admin" }
      ]
    };
  }
}

async function saveState() {
  localStorage.setItem(STATIC_STORAGE_KEY, JSON.stringify(state));
  try {
    await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
  } catch {
    // GitHub Pages has no backend; localStorage keeps the browser copy.
  }
}

function showApp() {
  els.loginScreen.classList.toggle("hidden", Boolean(currentUser));
  els.appShell.classList.toggle("hidden", !currentUser);
  if (!currentUser) return;
  els.currentUser.textContent = `${currentUser.name} - ${roleText[currentUser.role]}`;
  applyPermissions();
  renderAll();
}

function applyPermissions() {
  const allowed = roleViews[currentUser.role] || [];
  document.querySelectorAll(".nav").forEach(btn => {
    btn.hidden = !allowed.includes(btn.dataset.view);
  });
  if (!allowed.includes(document.querySelector(".nav.active")?.dataset.view)) {
    switchView(allowed[0] || "dashboard");
  }
}

function switchView(view) {
  if (!roleViews[currentUser.role].includes(view)) return alert("ليس لديك صلاحية لهذا القسم");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  document.querySelectorAll(".nav").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  els.pageTitle.textContent = titles[view];
}

function productById(productId) {
  return state.products.find(p => p.id === productId);
}

function customerById(customerId) {
  return state.customers.find(c => c.id === customerId);
}

function supplierById(supplierId) {
  return state.suppliers.find(s => s.id === supplierId);
}

function customerDocuments(customerId) {
  return state.documents.filter(d => d.customerId === customerId);
}

function renderAll() {
  renderSelects();
  renderDashboard();
  renderProducts();
  renderCustomers();
  renderDocuments();
  renderReports();
  renderStock();
  renderOrders();
  renderUsers();
}

function renderDashboard() {
  const invoices = state.documents.filter(d => d.type === "invoice");
  const totalSales = invoices.reduce((sum, d) => sum + Number(d.total || 0), 0);
  const profit = Math.round(totalSales * 0.22);
  const demand = {};
  state.documents.forEach(d => demand[d.productId] = (demand[d.productId] || 0) + Number(d.quantity || 0));
  const topProductId = Object.entries(demand).sort((a, b) => b[1] - a[1])[0]?.[0];
  const late = state.orders.filter(o => o.status !== "تم التركيب" && o.deliveryDate && o.deliveryDate < today());

  els.stats.innerHTML = [
    ["إجمالي المبيعات", money.format(totalSales)],
    ["أكثر خام مطلوب", productById(topProductId)?.name || "لا يوجد"],
    ["العملاء الجدد", `${state.customers.length} عميل`],
    ["أرباح تقريبية", money.format(profit)],
    ["الطلبات المتأخرة", `${late.length} طلب`]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join("");

  els.stockAlerts.innerHTML = state.products.length ? state.products.slice(0, 4).map(p => `
    <div class="item"><div><strong>${p.name}</strong><br><span>${money.format(Number(p.price || 0))}</span></div><button class="ghost" data-jump="stock">عرض</button></div>
  `).join("") : `<div class="item">لا توجد منتجات حالياً</div>`;

  els.lateOrders.innerHTML = late.length ? late.map(o => `
    <div class="item"><div><strong>${customerById(o.customerId)?.name || "عميل"}</strong><br><span>${o.status} - التسليم ${o.deliveryDate}</span></div><span class="danger">${o.technician || ""}</span></div>
  `).join("") : `<div class="item">لا توجد طلبات متأخرة</div>`;
}

function renderProducts() {
  const q = document.querySelector("#productSearch").value.trim();
  const products = state.products.filter(p => `${p.name} ${p.kind} ${p.color} ${p.size}`.includes(q));
  els.products.innerHTML = products.map(p => `
    <article class="card">
      <div class="stone-img" style="${p.image ? `background-image:url('${p.image}')` : ""}"></div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <div class="meta">
          <span class="tag">${p.kind}</span><span class="tag">${p.color}</span><span class="tag">${p.size || "بدون مقاس"}</span><span class="tag">${p.thickness || "بدون سمك"}</span>
        </div>
        <strong>${money.format(Number(p.price || 0))} / متر</strong>
        <p>${p.notes || ""}</p>
        <div class="row-actions">
          <button class="ghost" data-edit-product="${p.id}">تعديل</button>
          <button class="ghost" data-delete-product="${p.id}">حذف</button>
        </div>
      </div>
    </article>
  `).join("") || `<div class="panel">لا توجد منتجات</div>`;
}

function renderCustomers() {
  const q = document.querySelector("#customerSearch").value.trim();
  els.customers.innerHTML = state.customers
    .filter(c => `${c.name} ${c.phone} ${c.address}`.includes(q))
    .map(c => `
      <tr>
        <td><strong>${c.name}</strong></td><td>${c.phone}</td><td>${c.address || ""}</td>
        <td>${customerDocuments(c.id).length}</td><td>${c.notes || ""}</td>
        <td><div class="row-actions"><button class="ghost" data-edit-customer="${c.id}">تعديل</button><button class="ghost" data-delete-customer="${c.id}">حذف</button></div></td>
      </tr>
    `).join("");
}

function renderDocuments() {
  els.documents.innerHTML = state.documents.slice().reverse().map(d => `
    <tr>
      <td>${d.number}</td><td>${d.type === "quote" ? "عرض سعر" : "فاتورة بيع"}</td>
      <td>${customerById(d.customerId)?.name || ""}</td><td>${productById(d.productId)?.name || ""}</td>
      <td>${money.format(Number(d.total || 0))}</td><td>${d.date}</td>
      <td><div class="row-actions"><button class="ghost" data-print-doc="${d.id}">طباعة / PDF</button><button class="ghost" data-whatsapp-doc="${d.id}">واتساب</button><button class="ghost" data-delete-doc="${d.id}">حذف</button></div></td>
    </tr>
  `).join("");
}

function paymentStatusText(status) {
  return { paid: "دفع كامل", deposit: "عربون", unpaid: "مدفعش" }[status] || "غير محدد";
}

function paymentMethodText(method) {
  return { cash: "نقدي", vodafone: "فودافون كاش", instapay: "انستا باي", bank: "تحويل بنكي" }[method] || "-";
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(new Date(value));
}

function renderReports() {
  els.reports.innerHTML = state.documents.slice().reverse().map(d => {
    const total = Number(d.total || 0);
    const paid = Number(d.paidAmount || 0);
    const remaining = Math.max(0, total - paid);
    return `
      <tr>
        <td>${formatDateTime(d.createdAt || d.date)}</td>
        <td>${customerById(d.customerId)?.name || ""}</td>
        <td>${productById(d.productId)?.name || ""}</td>
        <td>${money.format(total)}</td>
        <td>${money.format(paid)}</td>
        <td>${money.format(remaining)}</td>
        <td>${paymentStatusText(d.paymentStatus)}</td>
        <td>${paymentMethodText(d.paymentMethod)}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="8">لا توجد تقارير حتى الآن</td></tr>`;
}

function renderStock() {
  els.stockProducts.innerHTML = state.products.map(p => `
    <tr><td><strong>${p.name}</strong><br><span class="tag">${p.kind || ""}</span></td><td>${money.format(Number(p.price || 0))}</td></tr>
  `).join("");
}

function renderOrders() {
  const statuses = ["قيد المعاينة", "جاري التصنيع", "جاهز", "تم التركيب"];
  els.orders.innerHTML = statuses.map(status => `
    <section class="column">
      <h3>${status}</h3>
      ${state.orders.filter(o => o.status === status).map(o => `
        <div class="order-card">
          <strong>${customerById(o.customerId)?.name || ""}</strong>
          <span>${productById(o.productId)?.name || ""}</span>
          <span class="${o.deliveryDate && o.deliveryDate < today() && o.status !== "تم التركيب" ? "danger" : ""}">التسليم: ${o.deliveryDate || "-"}</span>
          <span>الفني: ${o.technician || "-"}</span>
          <select data-order-status="${o.id}">${statuses.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>
          <button class="ghost" data-delete-order="${o.id}">حذف</button>
        </div>
      `).join("") || "<span class='tag'>لا يوجد</span>"}
    </section>
  `).join("");
}

function renderUsers() {
  els.users.innerHTML = state.users.map(u => `
    <tr><td>${u.username}</td><td>${u.name}</td><td>${roleText[u.role]}</td><td>${u.role === "admin" ? "" : `<button class="ghost" data-delete-user="${u.id}">حذف</button>`}</td></tr>
  `).join("");
}

function renderSelects() {
  const productOptions = state.products.map(p => `<option value="${p.id}">${p.name} - ${p.color}</option>`).join("");
  const customerOptions = state.customers.map(c => `<option value="${c.id}">${c.name} - ${c.phone}</option>`).join("");
  const supplierOptions = [`<option value="">بدون مورد</option>`, ...state.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`)].join("");
  ["docProduct", "orderProduct"].forEach(x => document.querySelector(`#${x}`).innerHTML = productOptions);
  ["docCustomer", "orderCustomer"].forEach(x => document.querySelector(`#${x}`).innerHTML = customerOptions);
  syncCalculationFields();
}

function fillForm(form, data = {}) {
  [...form.elements].forEach(el => {
    if (!el.name || el.type === "file") return;
    el.value = data[el.name] ?? "";
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function readImage(file) {
  return new Promise(resolve => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function updateDocPrice() {
  const form = document.querySelector("#documentForm");
  const p = productById(form.productId.value);
  if (p && !form.unitPrice.value) form.unitPrice.value = p.price;
  const factor = form.unitMode.value === "linear" ? Number(form.widthFactor.value || 1) : 1;
  const total = Math.max(0, Number(form.quantity.value || 0) * Number(form.unitPrice.value || 0) * factor - Number(form.discount.value || 0));
  if (form.paymentStatus.value === "paid") form.paidAmount.value = total;
  if (form.paymentStatus.value === "unpaid") form.paidAmount.value = 0;
  document.querySelector("#docTotal").textContent = `الإجمالي: ${money.format(total)}`;
}

function syncCalculationFields() {
  const form = document.querySelector("#documentForm");
  const isLinear = form.unitMode.value === "linear";
  document.querySelectorAll(".linear-field").forEach(field => field.classList.toggle("hidden", !isLinear));
  document.querySelector("#quantityLabel").firstChild.textContent = isLinear ? "الطول بالمتر" : "الكمية";
  if (!isLinear) form.widthFactor.value = 1;
  updateDocPrice();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function printDocument(docId) {
  const d = state.documents.find(x => x.id === docId);
  const c = customerById(d.customerId) || {};
  const p = productById(d.productId) || {};
  const docTitle = d.type === "quote" ? "عرض سعر" : "فاتورة بيع";
  const unitText = d.unitMode === "linear" ? "متر طولي" : d.unitMode === "meter" ? "متر مربع" : "قطعة";
  const factor = d.unitMode === "linear" ? Number(d.widthFactor || 1) : 1;
  const subtotal = Number(d.quantity || 0) * Number(d.unitPrice || 0) * factor;
  const discount = Number(d.discount || 0);
  const total = Number(d.total || 0);
  const paid = Number(d.paidAmount || 0);
  const remaining = Math.max(0, total - paid);
  const qrText = encodeURIComponent(`العالمية للرخام والجرانيت\n${docTitle}: ${d.number}\nالعميل: ${c.name || ""}\nالإجمالي: ${money.format(total)}`);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${qrText}`;
  const win = window.open("", "_blank");
  win.document.write(`
    <!doctype html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(d.number)} - ${docTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          :root{--surface:#f8f9ff;--paper:#fff;--ink:#0b1c30;--muted:#5d5e61;--line:#d0c5b4;--gold:#715915;--gold2:#ffdf97;--panel:#eff4ff}
          *{box-sizing:border-box} body{margin:0;padding:34px 18px;background:radial-gradient(circle at 18% 10%,rgba(228,195,117,.22),transparent 30%),linear-gradient(135deg,#f8f9ff,#eef4ff);color:var(--ink);font-family:"Noto Sans Arabic",Arial,sans-serif}.serif{font-family:"Amiri","Noto Sans Arabic",serif}
          .no-print{max-width:1060px;margin:0 auto 22px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}button{border:0;border-radius:10px;min-height:44px;padding:10px 18px;font:inherit;font-weight:800;cursor:pointer}.print-btn{background:linear-gradient(135deg,#715915,#a68942);color:white}.light-btn{background:white;color:var(--gold);border:1px solid var(--line)}
          .invoice{max-width:1060px;margin:0 auto;background-color:var(--paper);background-image:repeating-linear-gradient(135deg,rgba(113,89,21,.045) 0 28px,rgba(228,195,117,.18) 29px 31px,transparent 32px 70px);border:1px solid var(--line);border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.04)}
          .head{padding:42px;display:flex;justify-content:space-between;gap:24px;align-items:center;border-bottom:1px solid var(--line);background:rgba(255,255,255,.72)}.brand{display:flex;align-items:center;gap:20px}.brand img{width:96px;height:96px;object-fit:contain}h1,h2,h3,p{margin:0}.brand h1{color:var(--gold);font-size:31px;line-height:1.2}.brand p,.kind p{color:var(--muted);margin-top:4px}.kind{text-align:left}.kind strong{display:block;color:var(--gold);font-size:28px}
          .details{padding:38px 42px;display:grid;grid-template-columns:1.1fr 1fr .8fr;gap:34px;border-bottom:1px solid var(--line)}.block h3{width:fit-content;color:var(--gold);border-bottom:1px solid var(--gold2);padding-bottom:6px;margin-bottom:14px;font-size:20px}.block p{color:var(--muted);line-height:1.9}.block strong{color:var(--ink)}.info{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;color:var(--muted)}.info strong{color:var(--ink);text-align:left}
          .qr{justify-self:end;width:188px;display:grid;place-items:center;padding:18px;border:1px solid rgba(228,195,117,.55);border-radius:14px;background:rgba(255,255,255,.68);box-shadow:0 4px 20px rgba(0,0,0,.04)}.qr-frame{position:relative;padding:8px;border:1px solid rgba(208,197,180,.5);background:#fff;border-radius:10px}.qr-frame:before,.qr-frame:after{content:"";position:absolute;width:14px;height:14px}.qr-frame:before{top:-4px;right:-4px;border-top:2px solid var(--gold);border-right:2px solid var(--gold)}.qr-frame:after{bottom:-4px;left:-4px;border-bottom:2px solid var(--gold);border-left:2px solid var(--gold)}.qr img{display:block;width:118px;height:118px}.qr span{margin-top:10px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
          .items{padding:34px 42px}table{width:100%;border-collapse:collapse}th{padding:15px 16px;background:rgba(255,223,151,.38);color:var(--gold);border-bottom:2px solid var(--gold);text-align:right}th:first-child{border-top-right-radius:10px}th:last-child{border-top-left-radius:10px;text-align:left}td{padding:20px 16px;border-bottom:1px solid var(--line);color:var(--ink);vertical-align:top}td:not(:first-child),th:not(:first-child){text-align:center}td:last-child{text-align:left;font-weight:800}.note{color:var(--muted);font-size:12px;margin-top:5px}
          .footer{padding:0 42px 38px;display:grid;grid-template-columns:1fr 1fr;gap:34px}.glass{padding:22px;border-radius:10px;background:rgba(255,255,255,.68);border:1px solid rgba(228,195,117,.35)}.terms{color:var(--muted);font-size:13px;line-height:1.9;margin-top:18px}.totals{align-self:start;padding:28px;background:var(--panel);border:1px solid rgba(208,197,180,.6);border-radius:10px}.row{display:flex;justify-content:space-between;gap:18px;padding:8px 0;color:var(--muted)}.grand{margin-top:10px;padding-top:16px;border-top:1px solid var(--gold2);color:var(--gold);font-size:24px;font-weight:800}.thanks{margin-top:16px;text-align:center;color:var(--gold);font-style:italic}.bar{padding:14px 42px;display:flex;justify-content:space-between;gap:12px;background:var(--gold);color:white;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:800}
          @media print{@page{size:A4;margin:10mm}body{padding:0;background:white}.no-print{display:none}.invoice{box-shadow:none;max-width:none;border-color:#ddd}}@media(max-width:760px){body{padding:16px 10px}.head,.details,.footer{grid-template-columns:1fr;flex-direction:column;padding:24px}.items{padding:24px;overflow-x:auto}table{min-width:680px}.qr{justify-self:start}.bar{flex-direction:column;padding:14px 24px}.kind{text-align:right}}
        </style>
      </head>
      <body>
        <div class="no-print"><button class="print-btn" onclick="window.print()">طباعة الفاتورة</button><button class="light-btn" onclick="window.close()">إغلاق</button></div>
        <article class="invoice">
          <section class="head">
            <div class="brand"><img src="assets/alamiya-logo.png" alt="Al-Alamiya Logo"><div><h1 class="serif">العالمية للرخام والجرانيت</h1><p>Al-Alamiya Marble & Granite</p><p>إدارة: م/ إيهاب عبدالعال</p></div></div>
            <div class="kind serif"><strong>${docTitle}</strong><p>${d.type === "quote" ? "Price Quotation" : "Sales Invoice"}</p><p>${escapeHtml(d.number)}</p></div>
          </section>
          <section class="details">
            <div class="block"><h3 class="serif">فاتورة إلى | Bill To</h3><p><strong>${escapeHtml(c.name || "عميل")}</strong></p><p>الهاتف: ${escapeHtml(c.phone || "-")}</p><p>${escapeHtml(c.address || "-")}</p><p>${escapeHtml(c.notes || "")}</p></div>
            <div class="block"><h3 class="serif">معلومات المستند | Document Info</h3><div class="info"><span>رقم المستند:</span><strong>${escapeHtml(d.number)}</strong><span>التاريخ:</span><strong>${formatDateTime(d.createdAt || d.date)}</strong><span>طريقة الحساب:</span><strong>${unitText}</strong>${d.unitMode === "linear" ? `<span>العرض / المعامل:</span><strong>${escapeHtml(d.linearWidth || "60")} سم × ${escapeHtml(d.widthFactor || 1)}</strong>` : ""}<span>الحالة:</span><strong>${docTitle}</strong><span>الدفع:</span><strong>${paymentStatusText(d.paymentStatus)} - ${paymentMethodText(d.paymentMethod)}</strong></div></div>
            <div class="qr"><div class="qr-frame"><img src="${qrSrc}" alt="Invoice QR Code"></div><span>Electronic Document</span></div>
          </section>
          <section class="items"><table><thead><tr><th>الصنف | Description</th><th>${d.unitMode === "linear" ? "الطول | Length" : "الكمية | Qty"}</th><th>الوحدة | Unit</th><th>السعر | Price</th><th>الإجمالي | Total</th></tr></thead><tbody><tr><td><strong>${escapeHtml(p.name || "خام")}</strong><p class="note">${escapeHtml([p.kind, p.color, p.size, p.thickness].filter(Boolean).join(" | "))}</p><p class="note">${escapeHtml(d.notes || p.notes || "")}</p></td><td>${escapeHtml(d.quantity)}</td><td>${unitText}${d.unitMode === "linear" ? ` × ${escapeHtml(d.widthFactor || 1)}` : ""}</td><td>${money.format(Number(d.unitPrice || 0))}</td><td>${money.format(subtotal)}</td></tr></tbody></table></section>
          <section class="footer">
            <div><div class="glass"><h3 class="serif">تفاصيل الدفع | Payment Details</h3><p>اسم الحساب: العالمية للرخام والجرانيت</p><p>مسؤول الحساب: م/ إيهاب عبدالعال</p><p>يرجى مراجعة الإدارة قبل التحويل النهائي.</p></div><div class="terms"><strong>الشروط والأحكام | Terms & Conditions:</strong><p>الخامات الطبيعية قد يظهر بها اختلاف بسيط في العروق والدرجة. يعتبر اعتماد المستند موافقة على المواصفات والأسعار المذكورة.</p></div></div>
            <div><div class="totals"><div class="row"><span>المجموع الفرعي | Subtotal</span><strong>${money.format(subtotal)}</strong></div><div class="row"><span>الخصم | Discount</span><strong>${money.format(discount)}</strong></div><div class="row"><span>المدفوع | Paid</span><strong>${money.format(paid)}</strong></div><div class="row"><span>المتبقي | Remaining</span><strong>${money.format(remaining)}</strong></div><div class="row grand"><span>الإجمالي الكلي | Total</span><strong>${money.format(total)}</strong></div></div><p class="thanks serif">نشكركم لاختياركم فخامة العالمية | Thank you for choosing prestige.</p></div>
          </section>
          <footer class="bar"><span>Precision. Permanence. Prestige.</span><span>Al-Alamiya Marble & Granite</span><span>${new Date().getFullYear()}</span></footer>
        </article>
      </body>
    </html>
  `);
  win.document.close();
}

function whatsappDocument(docId) {
  const d = state.documents.find(x => x.id === docId);
  const c = customerById(d.customerId) || {};
  const p = productById(d.productId) || {};
  const text = `العالمية للرخام والجرانيت%0A${d.type === "quote" ? "عرض سعر" : "فاتورة بيع"} رقم ${d.number}%0Aالعميل: ${c.name || ""}%0Aالخامة: ${p.name || ""}%0Aالإجمالي: ${money.format(d.total)}`;
  window.open(`https://wa.me/${(c.phone || "").replace(/\D/g, "")}?text=${text}`, "_blank");
}

document.addEventListener("click", async e => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.dataset.view) switchView(btn.dataset.view);
  if (btn.dataset.jump) switchView(btn.dataset.jump);

  if (btn.id === "logoutBtn") {
    sessionStorage.removeItem(SESSION_KEY);
    currentUser = null;
    showApp();
  }
  if (btn.id === "exportBtn") {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `alamiya-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (btn.id === "importBtn") document.querySelector("#importFile").click();
  if (btn.id === "newProduct") {
    fillForm(document.querySelector("#productForm"), { id: "", kind: "رخام" });
    els.productDialog.showModal();
  }
  if (btn.dataset.openProduct) {
    fillForm(document.querySelector("#productForm"), { id: "", kind: "رخام" });
    els.productDialog.showModal();
  }
  if (btn.id === "newCustomer") {
    fillForm(document.querySelector("#customerForm"));
    els.customerDialog.showModal();
  }
  if (btn.dataset.editProduct) {
    fillForm(document.querySelector("#productForm"), productById(btn.dataset.editProduct));
    els.productDialog.showModal();
  }
  if (btn.dataset.editCustomer) {
    fillForm(document.querySelector("#customerForm"), customerById(btn.dataset.editCustomer));
    els.customerDialog.showModal();
  }
  if (btn.dataset.deleteProduct && confirm("حذف المنتج؟")) {
    state.products = state.products.filter(p => p.id !== btn.dataset.deleteProduct);
    await saveState(); renderAll();
  }
  if (btn.dataset.deleteCustomer && confirm("حذف العميل؟")) {
    state.customers = state.customers.filter(c => c.id !== btn.dataset.deleteCustomer);
    await saveState(); renderAll();
  }
  if (btn.dataset.deleteDoc && confirm("حذف المستند؟")) {
    state.documents = state.documents.filter(d => d.id !== btn.dataset.deleteDoc);
    await saveState(); renderAll();
  }
  if (btn.dataset.printDoc) printDocument(btn.dataset.printDoc);
  if (btn.dataset.whatsappDoc) whatsappDocument(btn.dataset.whatsappDoc);
  if (btn.dataset.deleteOrder && confirm("حذف الطلب؟")) {
    state.orders = state.orders.filter(o => o.id !== btn.dataset.deleteOrder);
    await saveState(); renderAll();
  }
  if (btn.dataset.deleteUser && confirm("حذف المستخدم؟")) {
    state.users = state.users.filter(u => u.id !== btn.dataset.deleteUser);
    await saveState(); renderAll();
  }
});

els.loginForm.addEventListener("submit", e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const normalizeLogin = value => String(value || "").trim().replace(/إ/g, "ا").replace(/أ/g, "ا").replace(/آ/g, "ا");
  const username = normalizeLogin(data.username || "ايهاب عبدالعال");
  const password = data.password || "123456";
  const user = state.users.find(u => normalizeLogin(u.username) === username && u.password === password);
  if (!user) return alert("بيانات الدخول غير صحيحة");
  currentUser = user;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  showApp();
});

document.querySelector("#productForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const image = await readImage(e.currentTarget.imageFile.files[0]);
  const product = {
    ...data,
    id: data.id || id("p"),
    price: Number(data.price || 0),
    quantity: Number(productById(data.id)?.quantity || 0),
    minStock: Number(productById(data.id)?.minStock || 0),
    image: image || productById(data.id)?.image || ""
  };
  const exists = state.products.some(p => p.id === product.id);
  state.products = exists ? state.products.map(p => p.id === product.id ? product : p) : [...state.products, product];
  els.productDialog.close();
  await saveState(); renderAll();
});

document.querySelector("#customerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const customer = { ...data, id: data.id || id("c") };
  const exists = state.customers.some(c => c.id === customer.id);
  state.customers = exists ? state.customers.map(c => c.id === customer.id ? customer : c) : [...state.customers, customer];
  els.customerDialog.close();
  await saveState(); renderAll();
});

function handleDocumentFormInput(e) {
  if (e.target.name === "productId") e.currentTarget.unitPrice.value = productById(e.target.value)?.price || 0;
  if (e.target.name === "linearWidth") {
    const factors = { "60": 1, "65": 1.15, "70": 1.25 };
    e.currentTarget.widthFactor.value = factors[e.target.value] || e.currentTarget.widthFactor.value || 1;
  }
  if (e.target.name === "paymentStatus") {
    const total = Math.max(0, Number(e.currentTarget.quantity.value || 0) * Number(e.currentTarget.unitPrice.value || 0) * (e.currentTarget.unitMode.value === "linear" ? Number(e.currentTarget.widthFactor.value || 1) : 1) - Number(e.currentTarget.discount.value || 0));
    if (e.target.value === "paid") e.currentTarget.paidAmount.value = total;
    if (e.target.value === "unpaid") e.currentTarget.paidAmount.value = 0;
  }
  syncCalculationFields();
}

document.querySelector("#documentForm").addEventListener("input", handleDocumentFormInput);
document.querySelector("#documentForm").addEventListener("change", handleDocumentFormInput);

document.querySelector("#documentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const quantity = Number(data.quantity || 0);
  const unitPrice = Number(data.unitPrice || 0);
  const discount = Number(data.discount || 0);
  const widthFactor = data.unitMode === "linear" ? Number(data.widthFactor || 1) : 1;
  const total = Math.max(0, quantity * unitPrice * widthFactor - discount);
  const paidAmount = data.paymentStatus === "paid" ? total : data.paymentStatus === "unpaid" ? 0 : Number(data.paidAmount || 0);
  const doc = {
    ...data,
    id: id("d"),
    number: `${data.type === "quote" ? "Q" : "INV"}-${String(state.documents.length + 1).padStart(4, "0")}`,
    date: today(),
    createdAt: new Date().toISOString(),
    quantity,
    unitPrice,
    discount,
    widthFactor,
    linearWidth: data.unitMode === "linear" ? data.linearWidth : "",
    paymentStatus: data.paymentStatus,
    paymentMethod: data.paymentMethod,
    paidAmount,
    total,
    createdBy: currentUser.id
  };
  state.documents.push(doc);
  if (doc.type === "invoice") {
    const p = productById(doc.productId);
    if (p) p.quantity = Math.max(0, Number(p.quantity || 0) - quantity);
  }
  e.currentTarget.reset();
  syncCalculationFields();
  await saveState(); renderAll();
});

document.querySelector("#supplierForm").addEventListener("submit", async e => {
  e.preventDefault();
  state.suppliers.push({ ...formData(e.currentTarget), id: id("s") });
  e.currentTarget.reset();
  await saveState(); renderAll();
});

document.querySelector("#orderForm").addEventListener("submit", async e => {
  e.preventDefault();
  state.orders.push({ ...formData(e.currentTarget), id: id("o"), createdAt: today(), createdBy: currentUser.id });
  e.currentTarget.reset();
  await saveState(); renderAll();
});

document.querySelector("#userForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (currentUser.role !== "admin") return alert("إضافة المستخدمين للـ Admin فقط");
  state.users.push({ ...formData(e.currentTarget), id: id("u") });
  e.currentTarget.reset();
  await saveState(); renderAll();
});

document.querySelector("#orders").addEventListener("change", async e => {
  if (!e.target.dataset.orderStatus) return;
  const order = state.orders.find(o => o.id === e.target.dataset.orderStatus);
  order.status = e.target.value;
  await saveState(); renderAll();
});

document.querySelector("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  state = JSON.parse(await file.text());
  await saveState();
  renderAll();
});

["#productSearch", "#customerSearch"].forEach(sel => document.querySelector(sel).addEventListener("input", renderAll));

function initMarbleShader() {
  const canvas = document.querySelector("#marbleShader");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let frame = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw() {
    frame += 0.006;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 0.28;

    for (let i = 0; i < 8; i += 1) {
      const y = (height / 9) * (i + 1) + Math.sin(frame * 1.4 + i) * 18;
      const gradient = ctx.createLinearGradient(0, y - 80, width, y + 80);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.28, "rgba(255,255,255,0)");
      gradient.addColorStop(0.48, i % 2 ? "rgba(166,137,66,0.22)" : "rgba(228,195,117,0.26)");
      gradient.addColorStop(0.68, "rgba(113,89,21,0.08)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 20 + (i % 3) * 7;
      ctx.beginPath();
      ctx.moveTo(-80, y);
      for (let x = -80; x <= width + 80; x += 80) {
        const wave = Math.sin(x * 0.008 + frame + i) * 28 + Math.cos(x * 0.004 + frame * 1.8) * 18;
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
}

initMarbleShader();

loadState().then(showApp).catch(error => {
  document.body.innerHTML = `<main style="padding:24px;font-family:Arial"><h1>تعذر تشغيل النظام</h1><p>${error.message}</p></main>`;
});
