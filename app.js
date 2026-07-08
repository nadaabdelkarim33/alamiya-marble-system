const API = "/api/state";
const SESSION_KEY = "alAlamiya.currentUser";
const STATIC_STORAGE_KEY = "alAlamiya.githubPagesState";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const localDateTimeValue = value => {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

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
  invoiceItems: document.querySelector("#invoiceItems"),
  reports: document.querySelector("#reports"),
  factoryReports: document.querySelector("#factoryReports"),
  stockProducts: document.querySelector("#stockProducts"),
  suppliers: document.querySelector("#suppliers"),
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
  factoryReports: "تقارير المصنع",
  stock: "المخزون والموردين",
  users: "الصلاحيات"
};

const roleText = { admin: "Admin", sales: "موظف مبيعات", stock: "مخزن", accountant: "محاسب" };
const roleViews = {
  admin: ["dashboard", "products", "customers", "billing", "reports", "factoryReports", "stock", "users"],
  sales: ["dashboard", "products", "customers", "billing", "reports"],
  stock: ["dashboard", "products", "factoryReports", "stock"],
  accountant: ["dashboard", "billing", "reports", "factoryReports", "customers"]
};

function normalizeState() {
  state.products ||= [];
  state.customers ||= [];
  state.documents ||= [];
  state.suppliers ||= [];
  state.movements ||= [];
  state.orders ||= [];
  state.factoryReports ||= [];
  state.users ||= [];
}

async function loadState() {
  const savedStaticState = localStorage.getItem(STATIC_STORAGE_KEY);
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error("API is not available");
    state = await res.json();
    normalizeState();
    return;
  } catch {
    if (savedStaticState) {
      state = JSON.parse(savedStaticState);
      normalizeState();
      return;
    }
  }

  try {
    const res = await fetch("data/state.json");
    if (!res.ok) throw new Error("Static data file is not available");
    state = await res.json();
    normalizeState();
  } catch {
    state = {
      products: [],
      customers: [],
      documents: [],
      suppliers: [],
      movements: [],
      orders: [],
      factoryReports: [],
      users: [
        { id: "u-admin", username: "ايهاب عبدالعال", name: "م/ إيهاب عبدالعال", password: "123456", role: "admin" }
      ]
    };
    normalizeState();
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

function findOrCreateInvoiceCustomer(data) {
  const name = String(data.customerName || "").trim();
  const phone = String(data.customerPhone || "").trim();
  const address = String(data.customerAddress || "").trim();
  const normalizedPhone = phone.replace(/\D/g, "");
  let customer = normalizedPhone
    ? state.customers.find(c => String(c.phone || "").replace(/\D/g, "") === normalizedPhone)
    : null;
  if (!customer && name) {
    customer = state.customers.find(c => String(c.name || "").trim() === name && !String(c.phone || "").trim());
  }
  if (customer) {
    customer.name = name || customer.name;
    customer.phone = phone || customer.phone;
    customer.address = address || customer.address;
    return customer;
  }
  customer = { id: id("c"), name: name || "عميل بدون اسم", phone, address, notes: "تم تسجيله تلقائيًا من الفاتورة" };
  state.customers.push(customer);
  return customer;
}

function supplierById(supplierId) {
  return state.suppliers.find(s => s.id === supplierId);
}

function findOrCreateProductSupplier(data) {
  const name = String(data.supplierName || "").trim();
  const phone = String(data.supplierPhone || "").trim();
  const address = String(data.supplierAddress || "").trim();
  const suppliedVia = String(data.suppliedVia || "").trim();
  if (!name && !phone) return null;
  const normalizedPhone = phone.replace(/\D/g, "");
  let supplier = normalizedPhone
    ? state.suppliers.find(s => String(s.phone || "").replace(/\D/g, "") === normalizedPhone)
    : state.suppliers.find(s => String(s.name || "").trim() === name);
  if (supplier) {
    supplier.name = name || supplier.name;
    supplier.phone = phone || supplier.phone;
    supplier.address = address || supplier.address || "";
    supplier.suppliedVia = suppliedVia || supplier.suppliedVia || "";
    supplier.updatedAt = new Date().toISOString();
    return supplier;
  }
  supplier = {
    id: id("s"),
    name: name || "مورد بدون اسم",
    phone,
    address,
    suppliedVia,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.suppliers.push(supplier);
  return supplier;
}

function customerDocuments(customerId) {
  return state.documents.filter(d => d.customerId === customerId);
}

function parseInvoiceMeasure(value) {
  const text = String(value || "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[٫,]/g, ".")
    .replace(/[×*]/g, "x")
    .trim();
  const parts = text.split("x").map(part => Number(part.trim())).filter(Number.isFinite);
  if (!parts.length) return 0;
  return parts.reduce((total, part) => total * part, 1);
}

function parseInvoiceLength(value) {
  const text = String(value || "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[٫,]/g, ".")
    .replace(/[×*]/g, "x")
    .trim();
  const first = Number(text.split("x")[0]?.trim());
  return Number.isFinite(first) ? first : 0;
}

function invoiceItemBase(item) {
  return (item.mode || "meter") === "linear" ? parseInvoiceLength(item.measure) : parseInvoiceMeasure(item.measure);
}

function calculationModeText(mode) {
  if (!mode) return "";
  return {
    meter: "متر مربع",
    linear: "متر طولي",
    supply_install: "توريد وتركيب"
  }[mode] || "متر مربع";
}

function invoiceItemTotal(item) {
  const count = Number(item.count || 0);
  const mode = item.mode || "meter";
  const base = invoiceItemBase(item);
  const qaim = Number(item.qaim || 0);
  const price = Number(item.price || 0);
  if (mode === "linear") return Math.max(0, count * base * (qaim || 1) * price);
  if (mode === "supply_install") return Math.max(0, count * base * (price + qaim));
  return Math.max(0, count * base * price);
}

function getDocumentItems(form = document.querySelector("#documentForm")) {
  const rows = [...form.querySelectorAll(".invoice-item-row")];
  return rows.map(row => {
    const item = {
      mode: row.querySelector('[data-item-field="mode"]').value || "meter",
      count: Number(row.querySelector('[data-item-field="count"]').value || 0),
      measure: row.querySelector('[data-item-field="measure"]').value.trim(),
      qaim: Number(row.querySelector('[data-item-field="qaim"]').value || 1),
      price: Number(row.querySelector('[data-item-field="price"]').value || 0)
    };
    item.total = invoiceItemTotal(item);
    return item;
  }).filter(item => item.count || item.measure || item.price);
}

function invoiceItemsSubtotal(items) {
  return items.reduce((sum, item) => sum + invoiceItemTotal(item), 0);
}

function documentProductName(doc) {
  if (doc.items?.length) {
    const productName = productById(doc.productId)?.name || "";
    return `${productName || "بنود فاتورة"} (${doc.items.length} بند)`;
  }
  return productById(doc.productId)?.name || "";
}

function documentCalculationSummary(doc) {
  if (!doc.items?.length) {
    const unitText = doc.unitMode === "linear" ? "متر طولي" : doc.unitMode === "meter" ? "متر مربع" : "قطعة";
    return `${unitText} - ${money.format(Number(doc.total || 0))}`;
  }
  return doc.items.map((item, index) => {
    const mode = calculationModeText(item.mode || "meter");
    const total = money.format(invoiceItemTotal(item));
    const extra = item.mode === "linear"
      ? ` | قائم ${item.qaim || 1}`
      : item.mode === "supply_install"
        ? ` | تركيب ${money.format(Number(item.qaim || 0))}`
        : "";
    return `بند ${index + 1}: ${mode} | عدد ${item.count || 0} | مقاس ${item.measure || "-"} | سعر ${money.format(Number(item.price || 0))}${extra} | ${total}`;
  }).join("<br>");
}

function renderAll() {
  const factoryDate = document.querySelector("#factoryReportForm [name='dateTime']");
  if (factoryDate && !factoryDate.value) factoryDate.value = localDateTimeValue();
  renderSelects();
  renderDashboard();
  renderProducts();
  renderCustomers();
  renderDocuments();
  renderReports();
  renderFactoryReports();
  renderStock();
  renderOrders();
  renderUsers();
  ensureInvoiceItems();
}

function renderDashboard() {
  const invoices = state.documents.filter(d => d.type === "invoice");
  const totalSales = invoices.reduce((sum, d) => sum + Number(d.total || 0), 0);
  const factoryExpenses = state.factoryReports.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const profit = Math.max(0, Math.round(totalSales * 0.22) - factoryExpenses);
  const demand = {};
  state.documents.forEach(d => demand[d.productId] = (demand[d.productId] || 0) + Number(d.quantity || 0));
  const topProductId = Object.entries(demand).sort((a, b) => b[1] - a[1])[0]?.[0];
  const late = state.orders.filter(o => o.status !== "تم التركيب" && o.deliveryDate && o.deliveryDate < today());

  els.stats.innerHTML = [
    ["إجمالي المبيعات", money.format(totalSales)],
    ["أكثر خام مطلوب", productById(topProductId)?.name || "لا يوجد"],
    ["العملاء الجدد", `${state.customers.length} عميل`],
    ["مصروفات المصنع", money.format(factoryExpenses)],
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
  els.products.innerHTML = products.map(p => {
    const supplier = supplierById(p.supplierId) || {};
    return `
    <article class="card">
      <div class="stone-img" style="${p.image ? `background-image:url('${p.image}')` : ""}"></div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <div class="meta">
          <span class="tag">${p.kind}</span><span class="tag">${p.color}</span><span class="tag">${p.size || "بدون مقاس"}</span><span class="tag">${p.thickness || "بدون سمك"}</span>
        </div>
        <strong>${money.format(Number(p.price || 0))} / متر</strong>
        <p>${p.notes || ""}</p>
        <details class="customer-history product-history">
          <summary>تفاصيل الخام والمورد</summary>
          <div class="customer-history-list">
            <article class="customer-history-card">
              <div>
                <span>المورد: ${supplier.name || p.supplierName || "-"}</span>
                <span>رقم المورد: ${supplier.phone || p.supplierPhone || "-"}</span>
                <span>جه إزاي: ${p.suppliedVia || supplier.suppliedVia || "-"}</span>
                <span>تاريخ التسجيل: ${formatDateTime(p.suppliedAt || p.createdAt)}</span>
              </div>
              <p>النوع: ${p.kind || "-"} | اللون: ${p.color || "-"} | المقاس: ${p.size || "-"} | السمك: ${p.thickness || "-"}</p>
            </article>
          </div>
        </details>
        <div class="row-actions">
          <button class="ghost" data-edit-product="${p.id}">تعديل</button>
          <button class="ghost" data-delete-product="${p.id}">حذف</button>
        </div>
      </div>
    </article>
  `;
  }).join("") || `<div class="panel">لا توجد منتجات</div>`;
}

function renderCustomers() {
  const q = document.querySelector("#customerSearch").value.trim();
  els.customers.innerHTML = state.customers
    .filter(c => `${c.name} ${c.phone} ${c.address}`.includes(q))
    .map(c => {
      const docs = customerDocuments(c.id).slice().reverse();
      const history = docs.length ? docs.map(d => {
        const total = Number(d.total || 0);
        const paid = Number(d.paidAmount || 0);
        const remaining = Math.max(0, total - paid);
        return `
          <article class="customer-history-card">
            <div>
              <strong>${d.type === "quote" ? "عرض سعر" : "فاتورة بيع"} ${d.number}</strong>
              <span>${formatDateTime(d.createdAt || d.date)}</span>
            </div>
            <div>
              <span>الطلب: ${documentProductName(d)}</span>
              <span>الحالة: ${d.orderStatus || "-"}</span>
              <span>التسليم: ${d.deliveryDate || "-"}</span>
              <span>الفني: ${d.technician || "-"}</span>
            </div>
            <div>
              <span>الإجمالي: ${money.format(total)}</span>
              <span>المدفوع: ${money.format(paid)}</span>
              <span>المتبقي: ${money.format(remaining)}</span>
              <span>الدفع: ${paymentStatusText(d.paymentStatus)} - ${paymentMethodText(d.paymentMethod)}</span>
            </div>
            <p>${documentCalculationSummary(d)}</p>
            <div class="customer-history-actions">
              <button class="ghost" data-open-doc="${d.id}">فتح الفاتورة</button>
              <button class="ghost" data-print-doc="${d.id}">طباعة</button>
              <button class="ghost" data-pdf-doc="${d.id}">حفظ PDF</button>
            </div>
          </article>
        `;
      }).join("") : `<div class="customer-history-empty">لا توجد طلبات مسجلة لهذا العميل</div>`;
      return `
      <tr>
        <td><strong>${c.name}</strong></td><td>${c.phone}</td><td>${c.address || ""}</td>
        <td>${customerDocuments(c.id).length}</td><td>${c.notes || ""}</td>
        <td><div class="row-actions"><button class="ghost" data-edit-customer="${c.id}">تعديل</button><button class="ghost" data-delete-customer="${c.id}">حذف</button></div></td>
      </tr>
      <tr class="customer-history-row">
        <td colspan="6">
          <details class="customer-history">
            <summary>عرض طلبات العميل وحساباته</summary>
            <div class="customer-history-list">${history}</div>
          </details>
        </td>
      </tr>
    `;
    }).join("");
}

function renderDocuments() {
  els.documents.innerHTML = state.documents.slice().reverse().map(d => `
    <tr>
      <td>${d.number}</td><td>${d.type === "quote" ? "عرض سعر" : "فاتورة بيع"}</td>
      <td>${customerById(d.customerId)?.name || ""}</td><td>${documentProductName(d)}</td>
      <td>${d.orderStatus || "-"}</td><td>${d.deliveryDate || "-"}</td>
      <td>${money.format(Number(d.total || 0))}</td><td>${d.date}</td>
      <td><div class="row-actions"><button class="ghost" data-open-doc="${d.id}">فتح الفاتورة</button><button class="ghost" data-print-doc="${d.id}">طباعة</button><button class="ghost" data-pdf-doc="${d.id}">حفظ PDF</button><button class="ghost" data-whatsapp-doc="${d.id}">واتساب</button><button class="ghost" data-delete-doc="${d.id}">حذف</button></div></td>
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

function formatInvoiceDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = number => String(number).padStart(2, "0");
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? "PM" : "AM";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} - ${pad(hours12)}:${pad(date.getMinutes())} ${ampm}`;
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
        <td>${documentProductName(d)}</td>
        <td>${money.format(total)}</td>
        <td>${money.format(paid)}</td>
        <td>${money.format(remaining)}</td>
        <td>${paymentStatusText(d.paymentStatus)}</td>
        <td>${paymentMethodText(d.paymentMethod)}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="8">لا توجد تقارير حتى الآن</td></tr>`;
}

function renderFactoryReports() {
  if (!els.factoryReports) return;
  els.factoryReports.innerHTML = state.factoryReports.slice().reverse().map(r => `
    <tr>
      <td>${r.number}</td>
      <td>${r.type || "-"}</td>
      <td><strong>${r.title || "-"}</strong><br><span>${r.notes || ""}</span></td>
      <td>${money.format(Number(r.amount || 0))}</td>
      <td>${formatDateTime(r.dateTime || r.createdAt)}</td>
      <td>${r.person || "-"}</td>
      <td>${paymentMethodText(r.paymentMethod)}</td>
      <td>
        <div class="row-actions">
          <button class="ghost" data-open-factory-report="${r.id}">فتح الإيصال</button>
          <button class="ghost" data-print-factory-report="${r.id}">طباعة</button>
          <button class="ghost" data-pdf-factory-report="${r.id}">حفظ PDF</button>
          <button class="ghost" data-delete-factory-report="${r.id}">حذف</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8">لا توجد تقارير مصنع حتى الآن</td></tr>`;
}

function renderStock() {
  els.stockProducts.innerHTML = state.products.map(p => `
    <tr><td><strong>${p.name}</strong><br><span class="tag">${p.kind || ""}</span></td><td>${money.format(Number(p.price || 0))}</td></tr>
  `).join("");
  if (!els.suppliers) return;
  els.suppliers.innerHTML = state.suppliers.map(s => {
    const products = state.products.filter(p => p.supplierId === s.id);
    const lastDate = products.map(p => p.suppliedAt || p.createdAt).filter(Boolean).sort().at(-1) || s.updatedAt || s.createdAt;
    const history = products.length ? products.map(p => `
      <article class="customer-history-card">
        <div>
          <strong>${p.name}</strong>
          <span>${p.kind || ""}</span>
          <span>${money.format(Number(p.price || 0))}</span>
          <span>${formatDateTime(p.suppliedAt || p.createdAt)}</span>
        </div>
        <p>جه إزاي: ${p.suppliedVia || s.suppliedVia || "-"} | اللون: ${p.color || "-"} | المقاس: ${p.size || "-"} | السمك: ${p.thickness || "-"}</p>
      </article>
    `).join("") : `<div class="customer-history-empty">لا توجد خامات مسجلة لهذا المورد</div>`;
    return `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.phone || "-"}</td>
        <td>${products.length}</td>
        <td>${formatDateTime(lastDate)}</td>
      </tr>
      <tr class="customer-history-row">
        <td colspan="4">
          <details class="customer-history">
            <summary>عرض خامات المورد وتفاصيلها</summary>
            <div class="customer-history-list">${history}</div>
          </details>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4">لا يوجد موردين حتى الآن</td></tr>`;
}

function renderOrders() {
  if (!els.orders) return;
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
  const supplierOptions = [`<option value="">بدون مورد</option>`, ...state.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`)].join("");
  ["docProduct", "orderProduct"].forEach(x => {
    const select = document.querySelector(`#${x}`);
    if (select) select.innerHTML = productOptions;
  });
  const orderCustomer = document.querySelector("#orderCustomer");
  if (orderCustomer) orderCustomer.innerHTML = state.customers.map(c => `<option value="${c.id}">${c.name} - ${c.phone}</option>`).join("");
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

function addInvoiceItemRow(item = {}) {
  const row = document.createElement("div");
  row.className = "invoice-item-row";
  const selectedMode = item.mode || "meter";
  row.innerHTML = `
    <select data-item-field="mode">
      <option value="meter" ${selectedMode === "meter" ? "selected" : ""}>متر مربع</option>
      <option value="linear" ${selectedMode === "linear" ? "selected" : ""}>متر طولي</option>
      <option value="supply_install" ${selectedMode === "supply_install" ? "selected" : ""}>توريد وتركيب</option>
    </select>
    <input data-item-field="count" type="number" step="0.01" min="0" placeholder="عدد" value="${escapeHtml(item.count ?? 1)}" />
    <input data-item-field="measure" placeholder="مثال: 1.20×0.60 أو 1.20" value="${escapeHtml(item.measure || "")}" />
    <input data-item-field="qaim" type="number" step="0.01" min="0" placeholder="قائم / تركيب" value="${escapeHtml(item.qaim ?? "")}" />
    <input data-item-field="price" type="number" step="0.01" min="0" placeholder="السعر" value="${escapeHtml(item.price ?? "")}" />
    <strong class="invoice-item-total">${money.format(invoiceItemTotal(item))}</strong>
    <button class="icon" type="button" data-remove-invoice-item title="حذف البند"><span class="material-symbols-outlined">delete</span></button>
  `;
  els.invoiceItems.appendChild(row);
  syncInvoiceItemRow(row);
  updateDocPrice();
}

function syncInvoiceItemRow(row) {
  const mode = row.querySelector('[data-item-field="mode"]').value;
  const measure = row.querySelector('[data-item-field="measure"]');
  const qaim = row.querySelector('[data-item-field="qaim"]');
  const price = row.querySelector('[data-item-field="price"]');
  if (mode === "meter") {
    measure.placeholder = "الطول×العرض مثال 1.20×0.60";
    price.placeholder = "سعر المتر المربع";
    qaim.placeholder = "غير مستخدم";
    qaim.value = "";
    qaim.disabled = true;
  } else if (mode === "linear") {
    measure.placeholder = "الطول فقط مثال 3.20";
    price.placeholder = "سعر المتر الطولي";
    qaim.placeholder = "القائم / عدد الأطوال";
    if (!qaim.value) qaim.value = 1;
    qaim.disabled = false;
  } else {
    measure.placeholder = "الطول×العرض مثال 1.20×0.60";
    price.placeholder = "سعر التوريد للمتر";
    qaim.placeholder = "سعر التركيب للمتر";
    qaim.disabled = false;
  }
}

function ensureInvoiceItems() {
  if (els.invoiceItems && !els.invoiceItems.children.length) {
    const form = document.querySelector("#documentForm");
    const productPrice = productById(form?.productId?.value)?.price || "";
    addInvoiceItemRow({ count: 1, qaim: 1, price: productPrice });
  }
}

function updateDocPrice() {
  const form = document.querySelector("#documentForm");
  const p = productById(form.productId.value);
  if (p && !form.unitPrice.value) form.unitPrice.value = p.price;
  const items = getDocumentItems(form);
  const itemsSubtotal = invoiceItemsSubtotal(items);
  const factor = form.unitMode.value === "linear" ? Number(form.widthFactor.value || 1) : 1;
  const legacySubtotal = Number(form.quantity.value || 0) * Number(form.unitPrice.value || 0) * factor;
  const subtotal = items.length ? itemsSubtotal : legacySubtotal;
  els.invoiceItems?.querySelectorAll(".invoice-item-row").forEach(row => {
    syncInvoiceItemRow(row);
    const item = {
      mode: row.querySelector('[data-item-field="mode"]').value,
      count: row.querySelector('[data-item-field="count"]').value,
      measure: row.querySelector('[data-item-field="measure"]').value,
      qaim: row.querySelector('[data-item-field="qaim"]').value,
      price: row.querySelector('[data-item-field="price"]').value
    };
    row.querySelector(".invoice-item-total").textContent = money.format(invoiceItemTotal(item));
  });
  const total = Math.max(0, subtotal + Number(form.extraWorkCost?.value || 0) - Number(form.discount.value || 0));
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

function printDocument(docId, action = "open") {
  const d = state.documents.find(x => x.id === docId);
  const c = customerById(d.customerId) || {};
  const p = productById(d.productId) || {};
  const docTitle = d.type === "quote" ? "عرض سعر" : "فاتورة بيع";
  const unitText = d.unitMode === "linear" ? "متر طولي" : d.unitMode === "meter" ? "متر مربع" : "قطعة";
  const factor = d.unitMode === "linear" ? Number(d.widthFactor || 1) : 1;
  const subtotal = Number(d.quantity || 0) * Number(d.unitPrice || 0) * factor;
  const discount = Number(d.discount || 0);
  const extraWorkCost = Number(d.extraWorkCost || 0);
  const total = Number(d.total || 0);
  const paid = Number(d.paidAmount || 0);
  const remaining = Math.max(0, total - paid);
  const qrText = encodeURIComponent(`العالمية للرخام والجرانيت\n${docTitle}: ${d.number}\nالعميل: ${c.name || ""}\nالإجمالي: ${money.format(total)}`);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${qrText}`;
  const win = window.open("", "_blank");
  if (!win) return alert("المتصفح منع فتح الفاتورة. اسمحي بالنوافذ المنبثقة للموقع.");
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
          :root{--surface:#f6f9fb;--paper:#fff;--ink:#0b1c30;--muted:#415469;--line:#c7d7e4;--gold:#d7ad00;--gold2:#ffdf1f;--blue:#00518c;--panel:#eef7ff}
          *{box-sizing:border-box} body{margin:0;padding:34px 18px;background:radial-gradient(circle at 18% 10%,rgba(255,223,31,.2),transparent 30%),linear-gradient(135deg,#f6f9fb,#e9f4fc);color:var(--ink);font-family:"Noto Sans Arabic",Arial,sans-serif}.serif{font-family:"Amiri","Noto Sans Arabic",serif}
          .no-print{max-width:1060px;margin:0 auto 22px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}button{border:0;border-radius:10px;min-height:44px;padding:10px 18px;font:inherit;font-weight:800;cursor:pointer}.print-btn{background:linear-gradient(135deg,#00518c,#0b6eae);color:white}.light-btn{background:white;color:var(--blue);border:1px solid var(--line)}
          .invoice{max-width:1060px;margin:0 auto;background-color:var(--paper);background-image:repeating-linear-gradient(135deg,rgba(0,81,140,.04) 0 28px,rgba(255,223,31,.16) 29px 31px,transparent 32px 70px);border:1px solid var(--line);border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.04)}
          .head{padding:42px;display:flex;justify-content:space-between;gap:24px;align-items:center;border-bottom:1px solid var(--line);background:rgba(255,255,255,.72)}.brand{display:flex;align-items:center;gap:20px}.brand img{width:96px;height:96px;object-fit:contain}h1,h2,h3,p{margin:0}.brand h1{color:var(--gold);font-size:31px;line-height:1.2}.brand p,.kind p{color:var(--muted);margin-top:4px}.kind{text-align:left}.kind strong{display:block;color:var(--gold);font-size:28px}
          .details{padding:38px 42px;display:grid;grid-template-columns:1.1fr 1fr .8fr;gap:34px;border-bottom:1px solid var(--line)}.block h3{width:fit-content;color:var(--gold);border-bottom:1px solid var(--gold2);padding-bottom:6px;margin-bottom:14px;font-size:20px}.block p{color:var(--muted);line-height:1.9}.block strong{color:var(--ink)}.info{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;color:var(--muted)}.info strong{color:var(--ink);text-align:left}
          .qr{justify-self:end;width:188px;display:grid;place-items:center;padding:18px;border:1px solid rgba(255,223,31,.55);border-radius:14px;background:rgba(255,255,255,.68);box-shadow:0 4px 20px rgba(0,0,0,.04)}.qr-frame{position:relative;padding:8px;border:1px solid rgba(199,215,228,.7);background:#fff;border-radius:10px}.qr-frame:before,.qr-frame:after{content:"";position:absolute;width:14px;height:14px}.qr-frame:before{top:-4px;right:-4px;border-top:2px solid var(--gold);border-right:2px solid var(--gold)}.qr-frame:after{bottom:-4px;left:-4px;border-bottom:2px solid var(--blue);border-left:2px solid var(--blue)}.qr img{display:block;width:118px;height:118px}.qr span{margin-top:10px;color:var(--blue);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
          .items{padding:34px 42px}table{width:100%;border-collapse:collapse}th{padding:15px 16px;background:rgba(255,223,151,.38);color:var(--gold);border-bottom:2px solid var(--gold);text-align:right}th:first-child{border-top-right-radius:10px}th:last-child{border-top-left-radius:10px;text-align:left}td{padding:20px 16px;border-bottom:1px solid var(--line);color:var(--ink);vertical-align:top}td:not(:first-child),th:not(:first-child){text-align:center}td:last-child{text-align:left;font-weight:800}.note{color:var(--muted);font-size:12px;margin-top:5px}
          .footer{padding:0 42px 38px;display:grid;grid-template-columns:1fr 1fr;gap:34px}.glass{padding:22px;border-radius:10px;background:rgba(255,255,255,.68);border:1px solid rgba(255,223,31,.35)}.terms{color:var(--muted);font-size:13px;line-height:1.9;margin-top:18px}.totals{align-self:start;padding:28px;background:var(--panel);border:1px solid rgba(199,215,228,.8);border-radius:10px}.row{display:flex;justify-content:space-between;gap:18px;padding:8px 0;color:var(--muted)}.grand{margin-top:10px;padding-top:16px;border-top:1px solid var(--gold2);color:var(--blue);font-size:24px;font-weight:800}.thanks{margin-top:16px;text-align:center;color:var(--gold);font-style:italic}.bar{padding:14px 42px;display:flex;justify-content:space-between;gap:12px;background:var(--blue);color:white;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:800}
          @media print{@page{size:A4;margin:10mm}body{padding:0;background:white}.no-print{display:none}.invoice{box-shadow:none;max-width:none;border-color:#ddd}}@media(max-width:760px){body{padding:16px 10px}.head,.details,.footer{grid-template-columns:1fr;flex-direction:column;padding:24px}.items{padding:24px;overflow-x:auto}table{min-width:680px}.qr{justify-self:start}.bar{flex-direction:column;padding:14px 24px}.kind{text-align:right}}
        </style>
      </head>
      <body>
        <div class="no-print"><button class="print-btn" onclick="window.print()">طباعة الفاتورة</button><button class="light-btn" onclick="window.close()">إغلاق</button></div>
        <article class="invoice">
          <section class="head">
            <div class="brand"><img src="assets/alamiya-logo-official.jpg" alt="Al-Alamiya Logo" style="border-radius:50%;border:3px solid #ffdf1f"><div><h1 class="serif">العالمية للرخام والجرانيت</h1><p>Al-Alamiya Marble & Granite</p><p>إدارة: م/ إيهاب عبدالعال</p><p>تليفون: 01005541302</p></div></div>
            <div class="kind serif"><strong>${docTitle}</strong><p>${d.type === "quote" ? "Price Quotation" : "Sales Invoice"}</p><p>${escapeHtml(d.number)}</p></div>
          </section>
          <section class="details">
            <div class="block"><h3 class="serif">فاتورة إلى | Bill To</h3><p><strong>${escapeHtml(c.name || "عميل")}</strong></p><p>الهاتف: ${escapeHtml(c.phone || "-")}</p><p>${escapeHtml(c.address || "-")}</p><p>${escapeHtml(c.notes || "")}</p></div>
            <div class="block"><h3 class="serif">معلومات المستند | Document Info</h3><div class="info"><span>رقم المستند:</span><strong>${escapeHtml(d.number)}</strong><span>التاريخ:</span><strong>${formatInvoiceDate(d.createdAt || d.date)}</strong><span>طريقة الحساب:</span><strong>${unitText}</strong>${d.unitMode === "linear" ? `<span>العرض / المعامل:</span><strong>${escapeHtml(d.linearWidth || "60")} سم × ${escapeHtml(d.widthFactor || 1)}</strong>` : ""}<span>الحالة:</span><strong>${docTitle}</strong><span>الدفع:</span><strong>${paymentStatusText(d.paymentStatus)} - ${paymentMethodText(d.paymentMethod)}</strong></div></div>
            <div class="qr"><div class="qr-frame"><img src="${qrSrc}" alt="Invoice QR Code"></div><span>Electronic Document</span></div>
          </section>
          <section class="items"><table><thead><tr><th>الصنف | Description</th><th>${d.unitMode === "linear" ? "الطول | Length" : "الكمية | Qty"}</th><th>الوحدة | Unit</th><th>السعر | Price</th><th>الإجمالي | Total</th></tr></thead><tbody><tr><td><strong>${escapeHtml(p.name || "خام")}</strong><p class="note">${escapeHtml([p.kind, p.color, p.size, p.thickness].filter(Boolean).join(" | "))}</p><p class="note">${escapeHtml(d.notes || p.notes || "")}</p></td><td>${escapeHtml(d.quantity)}</td><td>${unitText}${d.unitMode === "linear" ? ` × ${escapeHtml(d.widthFactor || 1)}` : ""}</td><td>${money.format(Number(d.unitPrice || 0))}</td><td>${money.format(subtotal)}</td></tr></tbody></table></section>
          <section class="footer">
            <div><div class="glass"><h3 class="serif">تفاصيل الدفع | Payment Details</h3><p>اسم الحساب: العالمية للرخام والجرانيت</p><p>مسؤول الحساب: م/ إيهاب عبدالعال</p><p>يرجى مراجعة الإدارة قبل التحويل النهائي.</p></div><div class="terms"><strong>الشروط والأحكام | Terms & Conditions:</strong><p>الخامات الطبيعية قد يظهر بها اختلاف بسيط في العروق والدرجة. يعتبر اعتماد المستند موافقة على المواصفات والأسعار المذكورة.</p></div></div>
            <div><div class="totals"><div class="row"><span>المجموع الفرعي | Subtotal</span><strong>${money.format(subtotal)}</strong></div><div class="row"><span>مصنعية / شغل إضافي</span><strong>${money.format(extraWorkCost)}</strong></div><div class="row"><span>الخصم | Discount</span><strong>${money.format(discount)}</strong></div><div class="row"><span>المدفوع | Paid</span><strong>${money.format(paid)}</strong></div><div class="row"><span>المتبقي | Remaining</span><strong>${money.format(remaining)}</strong></div><div class="row grand"><span>الإجمالي الكلي | Total</span><strong>${money.format(total)}</strong></div></div><p class="thanks serif">نشكركم لاختياركم فخامة العالمية | Thank you for choosing prestige.</p></div>
          </section>
          <footer class="bar"><span>Precision. Permanence. Prestige.</span><span>Al-Alamiya Marble & Granite</span><span>${new Date().getFullYear()}</span></footer>
        </article>
      </body>
    </html>
  `);
  win.document.close();
}

function printDocument(docId, action = "open") {
  const d = state.documents.find(x => x.id === docId);
  const c = customerById(d.customerId) || {};
  const p = productById(d.productId) || {};
  const docTitle = d.type === "quote" ? "عرض سعر" : "فاتورة بيع";
  const items = d.items?.length ? d.items : [{
    count: Number(d.quantity || 0),
    measure: d.unitMode === "linear" ? `${d.quantity || 0}` : "1",
    qaim: d.unitMode === "linear" ? Number(d.widthFactor || 1) : 1,
    price: Number(d.unitPrice || 0),
    total: Number(d.subtotal || d.total || 0)
  }];
  const subtotal = Number(d.subtotal || invoiceItemsSubtotal(items));
  const discount = Number(d.discount || 0);
  const extraWorkCost = Number(d.extraWorkCost || 0);
  const total = Number(d.total || Math.max(0, subtotal + extraWorkCost - discount));
  const paid = Number(d.paidAmount || 0);
  const remaining = Math.max(0, total - paid);
  const ownerPhone = "01005541302";
  const invoiceDateText = formatInvoiceDate(d.createdAt || d.date);
  const factoryAddress = "المصنع: كفر السكرية - طريق طنطا شبين الكوم";
  const showroomAddress = "المعرض: شبين الكوم - شارع حامد نصار أمام مجمع المرافق";
  const factoryAddressText = "المصنع: كفر السكرية - طريق طنطا شبين الكوم";
  const showroomAddressText = "المعرض: شبين الكوم - شارع حامد نصار أمام مجمع المرافق";
  const factoryMapUrl = "https://maps.app.goo.gl/3eGsCPyYDPsLubm98";
  const showroomMapUrl = "https://maps.app.goo.gl/mXH7ahSLZ6P696XQ7";
  const factoryQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(factoryMapUrl)}`;
  const showroomQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(showroomMapUrl)}`;
  const autoPrintScript = action === "print"
    ? `<script>window.addEventListener("load", () => setTimeout(() => window.print(), 350));<\/script>`
    : "";
  const rows = Array.from({ length: Math.max(8, Math.ceil(items.length / 2)) }, (_, index) => {
    const right = items[index * 2] || {};
    const left = items[index * 2 + 1] || {};
    const cell = (item, key) => escapeHtml(item[key] ?? "");
    const note = item => item.price ? `<small>${money.format(invoiceItemTotal(item))}</small>` : "";
    const qaimText = item => item.mode === "linear" ? escapeHtml(item.qaim || 1) : item.mode === "supply_install" ? money.format(Number(item.qaim || 0)) : "";
    return `
      <tr>
        <td>${calculationModeText(right.mode)}</td>
        <td>${cell(right, "count")}</td>
        <td><strong>${cell(right, "measure")}</strong>${note(right)}</td>
        <td>${qaimText(right)}</td>
        <td>${calculationModeText(left.mode)}</td>
        <td>${cell(left, "count")}</td>
        <td><strong>${cell(left, "measure")}</strong>${note(left)}</td>
        <td>${qaimText(left)}</td>
      </tr>
    `;
  }).join("");
  const win = window.open("", "_blank");
  if (!win) return alert("المتصفح منع فتح الفاتورة. اسمحي بالنوافذ المنبثقة للموقع.");
  win.document.write(`
    <!doctype html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(d.number)} - ${docTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          *{box-sizing:border-box}
          body{margin:0;padding:18px;background:#eee;color:#111;font-family:"Noto Sans Arabic",Arial,sans-serif}
          .no-print{max-width:840px;margin:0 auto 12px;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}
          .print-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
          select,input{min-height:40px;border:1px solid #b8aa93;border-radius:8px;padding:6px 10px;font:inherit;background:white}
          input[type="range"]{width:120px}
          button{border:0;border-radius:8px;min-height:42px;padding:9px 16px;font:inherit;font-weight:800;cursor:pointer}
          .print-btn{background:#00518c;color:white}.light-btn{background:white;color:#00518c;border:1px solid #c7d7e4}
          .paper-wrap{display:flex;justify-content:center}
          .paper{width:840px;min-height:0;margin:auto;background:#fff;padding:18px 26px 22px;border:1px solid #222;box-shadow:0 10px 35px rgba(0,0,0,.18);transform:scale(var(--invoice-scale,1));transform-origin:top center}
          body.paper-a5 .paper{width:560px;min-height:790px}
          body.paper-half .paper{width:520px;min-height:740px}
          body.paper-receipt .paper{width:360px;min-height:0;padding:8px 10px}
          body.paper-receipt .doc-info{grid-template-columns:1fr}
          body.paper-receipt .summary{grid-template-columns:1fr}
          body.paper-receipt .brand-logo{width:44px;height:44px}
          body.paper-receipt .location-qr img{width:42px;height:42px}
          body.paper-receipt .address-line{font-size:9px}
          body.paper-receipt th,body.paper-receipt td{font-size:11px;padding:3px 2px;height:34px}
          .brand{display:grid;grid-template-columns:90px 1fr 142px;align-items:center;gap:14px;text-align:center;line-height:1.32;border:2px solid #222;padding:10px 12px;margin-bottom:10px}
          .brand-logo{width:72px;height:72px;display:block;margin:auto;border-radius:50%;border:3px solid #ffdf1f;object-fit:cover;box-shadow:0 5px 14px rgba(0,81,140,.14)}
          .brand h1{margin:0;color:#111;font-size:24px;font-weight:900}
          .brand h2{margin:1px 0;color:#111;font-size:14px;font-weight:900}
          .brand p{margin:0;font-size:12px;font-weight:800}
          .address-line{margin-top:4px;font-size:10px;font-weight:800;color:#333}
          .location-qr{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
          .location-qr a{display:grid;place-items:center;text-decoration:none;color:#0b1c30;border:1px solid #c7d7e4;border-radius:6px;padding:4px;background:#fff}
          .location-qr img{width:50px;height:50px;display:block}
          .doc-info{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 12px;margin:10px 0;font-size:12px;font-weight:800}
          .doc-info span{display:grid;grid-template-columns:max-content 1fr;align-items:center;gap:6px;border-bottom:1px dotted #555;padding:4px 0;text-align:right}
          .doc-info b{color:#00518c;white-space:nowrap}
          .doc-info b::after{content:" -";color:#111}
          .doc-info strong{font-weight:900;text-align:right;direction:rtl;min-width:0}
          table{width:100%;border-collapse:collapse;table-layout:auto;border:3px solid #222}
          th,td{border-left:2px solid #222;border-bottom:1px dotted #555;text-align:center;vertical-align:top;height:auto;min-height:42px;padding:6px 5px;font-size:13px;line-height:1.55;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
          th{height:30px;border-bottom:2px solid #222;font-size:13px;background:#f5f5f5}
          td:nth-child(4),th:nth-child(4){border-left:3px solid #222}
          td:nth-child(1),th:nth-child(1),td:nth-child(5),th:nth-child(5){width:11%}
          td:nth-child(2),th:nth-child(2),td:nth-child(6),th:nth-child(6){width:7%;white-space:nowrap}
          td:nth-child(3),th:nth-child(3),td:nth-child(7),th:nth-child(7){width:24%}
          td:nth-child(4),th:nth-child(4),td:nth-child(8),th:nth-child(8){width:8%}
          td strong{display:block;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
          td small{display:block;margin-top:2px;color:#00518c;font-size:11px;font-weight:800}
          .summary{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:10px}
          .summary div{border:2px solid #222;padding:6px 5px;text-align:center;font-size:12px;font-weight:800;min-height:44px}
          .summary strong{display:block;margin-top:2px;font-size:14px;color:#00518c}
          .notes{display:grid;grid-template-columns:1.2fr 1fr;gap:10px;margin-top:10px;font-size:11px}
          .box{border:2px solid #222;min-height:60px;padding:8px;line-height:1.6}
          .footer{margin-top:8px;display:flex;justify-content:space-between;gap:12px;font-size:12px;font-weight:800}
          @media print{@page{size:A4 portrait;margin:4mm}html,body{width:210mm;height:297mm;overflow:hidden}body{padding:0;background:white}.no-print{display:none}.paper-wrap{display:block}.paper{box-shadow:none;border:0;transform:scale(var(--invoice-scale,1));transform-origin:top right}.paper-a4 .paper{width:200mm;max-height:287mm;overflow:hidden}.paper-a5 .paper,.paper-half .paper{width:140mm;max-height:200mm;overflow:hidden}.paper-receipt .paper{width:76mm;max-height:287mm;overflow:hidden}}
          @media(max-width:900px){body{padding:8px}.paper{width:840px}.no-print{width:840px}}
        </style>
      </head>
      <body>
        <div class="no-print">
          <div class="print-controls">
            <select id="paperSize" title="مقاس الورقة">
              <option value="paper-a4">A4</option>
              <option value="paper-a5">A5</option>
              <option value="paper-half">نصف A4</option>
              <option value="paper-receipt">ورق فاتورة صغير</option>
            </select>
             <label>الحجم <input id="invoiceScale" type="range" min="60" max="115" value="100" /></label>
             <span id="scaleValue">100%</span>
          </div>
          <div class="print-controls">
            <button class="print-btn" type="button" id="invoicePrintBtn">طباعة</button>
            <button class="light-btn" type="button" id="invoicePdfBtn">تحميل PDF</button>
            <button class="light-btn" type="button" id="invoiceCloseBtn">إغلاق</button>
          </div>
        </div>
        <div class="paper-wrap"><main class="paper">
          <header class="brand">
            <div><img class="brand-logo" src="assets/alamiya-logo-official.jpg" alt="شعار العالمية"></div>
            <div>
              <h1>العالمية للرخام والجرانيت</h1>
              <h2>خطوط إنتاج أوتوماتيكية</h2>
              <p>إدارة: م/ إيهاب عبدالعال</p>
              <p>${ownerPhone}</p>
              <div class="address-line">${escapeHtml(factoryAddressText)} | ${escapeHtml(showroomAddressText)}</div>
            </div>
            <div class="location-qr">
              <a href="${factoryMapUrl}" target="_blank" rel="noopener">
                <img src="${factoryQrSrc}" alt="QR المصنع">
              </a>
              <a href="${showroomMapUrl}" target="_blank" rel="noopener">
                <img src="${showroomQrSrc}" alt="QR المعرض">
              </a>
            </div>
          </header>
          <section class="doc-info">
            <span><b>رقم</b><strong>${escapeHtml(d.number)}</strong></span>
            <span><b>النوع</b><strong>${docTitle}</strong></span>
            <span><b>التاريخ</b><strong>${invoiceDateText}</strong></span>
            <span><b>العميل</b><strong>${escapeHtml(c.name || "-")}</strong></span>
            <span><b>رقم العميل</b><strong>${escapeHtml(c.phone || "-")}</strong></span>
            <span><b>الخامة</b><strong>${escapeHtml(p.name || "-")}</strong></span>
            <span><b>حالة الطلب</b><strong>${escapeHtml(d.orderStatus || "-")}</strong></span>
            <span><b>ميعاد التسليم</b><strong>${escapeHtml(d.deliveryDate || "-")}</strong></span>
            <span><b>الفني</b><strong>${escapeHtml(d.technician || "-")}</strong></span>
          </section>
          <table>
            <thead><tr><th>الحساب</th><th>عدد</th><th>مقاس</th><th>قائم/تركيب</th><th>الحساب</th><th>عدد</th><th>مقاس</th><th>قائم/تركيب</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <section class="summary">
            <div>المجموع<strong>${money.format(subtotal)}</strong></div>
            <div>مصنعية<strong>${money.format(extraWorkCost)}</strong></div>
            <div>الخصم<strong>${money.format(discount)}</strong></div>
            <div>الإجمالي<strong>${money.format(total)}</strong></div>
            <div>المدفوع<strong>${money.format(paid)}</strong></div>
            <div>الباقي<strong>${money.format(remaining)}</strong></div>
          </section>
          <section class="notes">
            <div class="box"><strong>طريقة الحساب</strong> - متر مربع = العدد × الطول × العرض × سعر المتر. متر طولي = العدد × الطول × القائم × سعر المتر الطولي. توريد وتركيب = العدد × المساحة × (سعر التوريد + سعر التركيب).</div>
            <div class="box"><strong>الدفع</strong> - ${paymentStatusText(d.paymentStatus)} - ${paymentMethodText(d.paymentMethod)}<br><strong>التركيب</strong> - ${escapeHtml(d.orderStatus || "-")} - ${escapeHtml(d.technician || "-")}<br><strong>ملاحظات</strong> - ${escapeHtml(d.notes || "-")}</div>
          </section>
          <footer class="footer"><span>توقيع العميل ....................</span><span>توقيع الإدارة ....................</span></footer>
        </main></div>
        <script>
          const paperSize = document.querySelector("#paperSize");
          const invoiceScale = document.querySelector("#invoiceScale");
          const scaleValue = document.querySelector("#scaleValue");
          function syncPrintLayout() {
            document.body.classList.remove("paper-a4","paper-a5","paper-half","paper-receipt");
            document.body.classList.add(paperSize.value);
            const scale = Number(invoiceScale.value || 100) / 100;
            document.documentElement.style.setProperty("--invoice-scale", scale);
            scaleValue.textContent = invoiceScale.value + "%";
          }
          paperSize.addEventListener("change", syncPrintLayout);
          invoiceScale.addEventListener("input", syncPrintLayout);
          if (${action === "pdf" ? "true" : "false"}) {
            paperSize.value = "paper-a4";
            invoiceScale.value = "90";
          }
          syncPrintLayout();
          function bindTap(element, handler) {
            let touched = false;
            element.addEventListener("touchend", event => {
              touched = true;
              event.preventDefault();
              handler();
              setTimeout(() => touched = false, 500);
            }, { passive: false });
            element.addEventListener("click", event => {
              if (touched) return;
              event.preventDefault();
              handler();
            });
          }
          function loadHtml2Pdf() {
            if (window.html2pdf) return Promise.resolve();
            return new Promise((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          function printInvoice() {
            window.focus();
            setTimeout(() => window.print(), 150);
          }
          async function downloadInvoicePdf() {
            const paper = document.querySelector(".paper");
            const controls = document.querySelector(".no-print");
            try {
              await loadHtml2Pdf();
            } catch {
              alert("تحميل PDF المباشر يحتاج اتصال بالإنترنت. هفتح لك نافذة الطباعة بدلًا من ذلك.");
              printInvoice();
              return;
            }
            controls.style.display = "none";
            const opt = {
              margin: 0,
              filename: "${escapeHtml(d.number)}.pdf",
              image: { type: "jpeg", quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
              jsPDF: { unit: "mm", format: paperSize.value === "paper-a4" ? "a4" : paperSize.value === "paper-a5" ? "a5" : [148, 210], orientation: "portrait" }
            };
            try {
              await html2pdf().set(opt).from(paper).save();
            } finally {
              controls.style.display = "";
            }
          }
          bindTap(document.querySelector("#invoicePrintBtn"), printInvoice);
          bindTap(document.querySelector("#invoicePdfBtn"), downloadInvoicePdf);
          bindTap(document.querySelector("#invoiceCloseBtn"), () => window.close());
          if (${action === "pdf" ? "true" : "false"}) {
            window.addEventListener("load", () => setTimeout(downloadInvoicePdf, 700));
          }
        <\/script>
        ${autoPrintScript}
      </body>
    </html>
  `);
  win.document.close();
}

function whatsappDocument(docId) {
  const d = state.documents.find(x => x.id === docId);
  const c = customerById(d.customerId) || {};
  const text = `العالمية للرخام والجرانيت%0A${d.type === "quote" ? "عرض سعر" : "فاتورة بيع"} رقم ${d.number}%0Aالعميل: ${c.name || ""}%0Aالبنود: ${documentProductName(d)}%0Aالإجمالي: ${money.format(d.total)}`;
  window.open(`https://wa.me/${(c.phone || "").replace(/\D/g, "")}?text=${text}`, "_blank");
}

function factoryReportReceiptHtml(report) {
  return `
    <section class="factory-receipt">
      <header>
        <div>
          <p>إدارة: م/ إيهاب عبدالعال</p>
          <h1>العالمية للرخام والجرانيت</h1>
          <strong>إيصال تقرير مصنع</strong>
        </div>
        <div class="receipt-logo"></div>
      </header>
      <div class="receipt-meta">
        <span>رقم: ${escapeHtml(report.number || "")}</span>
        <span>التاريخ: ${formatDateTime(report.dateTime || report.createdAt)}</span>
      </div>
      <table>
        <tbody>
          <tr><th>نوع التقرير</th><td>${escapeHtml(report.type || "-")}</td></tr>
          <tr><th>البند / السبب</th><td>${escapeHtml(report.title || "-")}</td></tr>
          <tr><th>المبلغ الخارج</th><td>${money.format(Number(report.amount || 0))}</td></tr>
          <tr><th>المسؤول / الفني</th><td>${escapeHtml(report.person || "-")}</td></tr>
          <tr><th>طريقة الدفع</th><td>${paymentMethodText(report.paymentMethod)}</td></tr>
          <tr><th>التفاصيل</th><td>${escapeHtml(report.notes || "-")}</td></tr>
        </tbody>
      </table>
      <footer>
        <span>توقيع المستلم</span>
        <span>توقيع الإدارة</span>
      </footer>
    </section>
  `;
}

function printFactoryReport(reportId, action = "open") {
  const report = state.factoryReports.find(r => r.id === reportId);
  if (!report) return;
  const html = factoryReportReceiptHtml(report);
  const w = window.open("", "_blank");
  w.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${report.number}</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <style>
          :root{--gold:#d7ad00;--blue:#00518c;--line:#1f2937}
          *{box-sizing:border-box}
          body{margin:0;background:#f6f1e6;color:#0b1c30;font-family:"Noto Sans Arabic",Arial,sans-serif}
          .tools{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#fff;border-bottom:1px solid #ddd;z-index:5}
          button{border:0;border-radius:6px;padding:10px 14px;font-weight:800;cursor:pointer}
          .primary{background:var(--blue);color:#fff}.ghost{background:#fff;border:1px solid #c7d7e4;color:#0b1c30}
          .paper{width:var(--paper-width,148mm);min-height:var(--paper-height,210mm);margin:18px auto;padding:10mm;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.12);transform:scale(var(--receipt-scale,1));transform-origin:top center}
          .factory-receipt{border:2px solid var(--line);padding:10px;min-height:100%}
          header{display:flex;justify-content:space-between;align-items:center;text-align:right;border-bottom:2px solid var(--line);padding-bottom:8px;margin-bottom:8px}
          h1{margin:0;color:var(--gold);font-size:22px}p{margin:0 0 4px}.receipt-logo{width:78px;height:78px;border-radius:50%;border:2px solid #ffdf1f;background:url("assets/alamiya-logo-official.jpg") center/cover no-repeat}
          .receipt-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;font-weight:800}
          table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid var(--line);padding:9px;text-align:right;vertical-align:top}th{width:34%;background:#fff9d9;color:var(--blue)}
          footer{display:flex;justify-content:space-between;margin-top:42px;font-weight:800}
          @media print{.tools{display:none}.paper{margin:0;box-shadow:none;transform:none;width:100%;min-height:auto}@page{size:auto;margin:6mm}}
        </style>
      </head>
      <body>
        <div class="tools">
          <button class="primary" onclick="window.print()">طباعة</button>
          <button class="ghost" id="pdfBtn">حفظ PDF</button>
          <button class="ghost" onclick="window.close()">إغلاق</button>
        </div>
        <main class="paper" id="receipt">${html}</main>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
        <script>
          function savePdf(){
            const receipt = document.getElementById("receipt");
            html2pdf().set({
              margin: 4,
              filename: "${report.number}.pdf",
              image: { type: "jpeg", quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
              jsPDF: { unit: "mm", format: [148, 210], orientation: "portrait" }
            }).from(receipt).save();
          }
          document.getElementById("pdfBtn").addEventListener("click", savePdf);
          window.addEventListener("load", () => {
            if ("${action}" === "print") setTimeout(() => window.print(), 350);
            if ("${action}" === "pdf") setTimeout(savePdf, 500);
          });
        <\/script>
      </body>
    </html>
  `);
  w.document.close();
}

function activeViewForPrint() {
  return document.querySelector(".view.active");
}

function markActiveViewForPrint() {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("printing"));
  activeViewForPrint()?.classList.add("printing");
}

function clearPrintMark() {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("printing"));
}

function loadPdfLibrary() {
  if (window.html2pdf) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function downloadCurrentViewPdf() {
  const view = activeViewForPrint();
  if (!view) return;
  markActiveViewForPrint();
  try {
    await loadPdfLibrary();
    const title = (els.pageTitle.textContent || "العالمية").trim();
    const wrapper = document.createElement("section");
    wrapper.dir = "rtl";
    wrapper.style.cssText = "width:1120px;min-height:760px;padding:26px;background:#fff;color:#0b1c30;font-family:'Noto Sans Arabic',Arial,sans-serif";
    wrapper.innerHTML = `
      <style>
        *{box-sizing:border-box;animation:none!important;transition:none!important;opacity:1!important;filter:none!important}
        .view{display:grid!important;gap:18px!important}
        .hero{min-height:220px!important;color:#fff!important}
        .stats{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:16px!important}
        .grid.two{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px!important}
        .cards{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important}
        .table-wrap{overflow:visible!important}
        table{width:100%!important;min-width:0!important}
        th,td{font-size:12px!important;padding:9px!important}
      </style>
      <h1 style="margin:0 0 20px;color:#00518c;font-size:28px;text-align:right">${escapeHtml(title)}</h1>
    `;
    const clone = view.cloneNode(true);
    clone.classList.add("active");
    clone.querySelectorAll(".toolbar,.actions,.row-actions button[data-delete-doc],.row-actions button[data-delete-product],.row-actions button[data-delete-customer]").forEach(el => el.remove());
    wrapper.appendChild(clone);
    await html2pdf().set({
      margin: 4,
      filename: `alamiya-${title}-${today()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 1120, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
    }).from(wrapper).save();
  } catch {
    window.print();
  } finally {
    setTimeout(clearPrintMark, 1000);
  }
}

window.addEventListener("beforeprint", markActiveViewForPrint);
window.addEventListener("afterprint", clearPrintMark);

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
    await downloadCurrentViewPdf();
  }
  if (btn.id === "importBtn") document.querySelector("#importFile").click();
  if (btn.dataset.closeDialog === "product") {
    els.productDialog.close();
    document.querySelector("#productForm").reset();
  }
  if (btn.dataset.closeDialog === "customer") {
    els.customerDialog.close();
    document.querySelector("#customerForm").reset();
  }
  if (btn.id === "addInvoiceItem") addInvoiceItemRow();
  if (btn.dataset.removeInvoiceItem !== undefined) {
    btn.closest(".invoice-item-row")?.remove();
    ensureInvoiceItems();
    updateDocPrice();
  }
  if (btn.id === "newProduct") {
    fillForm(document.querySelector("#productForm"), { id: "", kind: "رخام", suppliedAt: localDateTimeValue() });
    els.productDialog.showModal();
  }
  if (btn.dataset.openProduct) {
    fillForm(document.querySelector("#productForm"), { id: "", kind: "رخام", suppliedAt: localDateTimeValue() });
    els.productDialog.showModal();
  }
  if (btn.id === "newCustomer") {
    fillForm(document.querySelector("#customerForm"));
    els.customerDialog.showModal();
  }
  if (btn.dataset.editProduct) {
    const product = productById(btn.dataset.editProduct);
    fillForm(document.querySelector("#productForm"), { ...product, suppliedAt: localDateTimeValue(product.suppliedAt || product.createdAt) });
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
    state.orders = state.orders.filter(o => o.documentId !== btn.dataset.deleteDoc);
    await saveState(); renderAll();
  }
  if (btn.dataset.openDoc) printDocument(btn.dataset.openDoc, "open");
  if (btn.dataset.printDoc) printDocument(btn.dataset.printDoc, "print");
  if (btn.dataset.pdfDoc) printDocument(btn.dataset.pdfDoc, "pdf");
  if (btn.dataset.openFactoryReport) printFactoryReport(btn.dataset.openFactoryReport, "open");
  if (btn.dataset.printFactoryReport) printFactoryReport(btn.dataset.printFactoryReport, "print");
  if (btn.dataset.pdfFactoryReport) printFactoryReport(btn.dataset.pdfFactoryReport, "pdf");
  if (btn.dataset.deleteFactoryReport && confirm("حذف تقرير المصنع؟")) {
    state.factoryReports = state.factoryReports.filter(r => r.id !== btn.dataset.deleteFactoryReport);
    await saveState(); renderAll();
  }
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
  const supplier = findOrCreateProductSupplier(data);
  const existingProduct = productById(data.id) || {};
  const product = {
    ...data,
    id: data.id || id("p"),
    price: Number(data.price || 0),
    quantity: Number(existingProduct.quantity || 0),
    minStock: Number(existingProduct.minStock || 0),
    supplierId: supplier?.id || existingProduct.supplierId || "",
    supplierName: supplier?.name || data.supplierName || existingProduct.supplierName || "",
    supplierPhone: supplier?.phone || data.supplierPhone || existingProduct.supplierPhone || "",
    suppliedVia: data.suppliedVia || existingProduct.suppliedVia || "",
    suppliedAt: data.suppliedAt ? new Date(data.suppliedAt).toISOString() : existingProduct.suppliedAt || new Date().toISOString(),
    createdAt: existingProduct.createdAt || new Date().toISOString(),
    image: image || existingProduct.image || ""
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
  if (e.target.name === "productId") {
    const productPrice = productById(e.target.value)?.price || 0;
    e.currentTarget.unitPrice.value = productPrice;
    const firstPrice = els.invoiceItems?.querySelector('[data-item-field="price"]');
    if (firstPrice && !firstPrice.value) firstPrice.value = productPrice;
  }
  if (e.target.name === "linearWidth") {
    const factors = { "60": 1, "65": 1.15, "70": 1.25 };
    e.currentTarget.widthFactor.value = factors[e.target.value] || e.currentTarget.widthFactor.value || 1;
  }
  if (e.target.name === "paymentStatus") {
    const items = getDocumentItems(e.currentTarget);
    const subtotal = items.length ? invoiceItemsSubtotal(items) : Number(e.currentTarget.quantity.value || 0) * Number(e.currentTarget.unitPrice.value || 0) * (e.currentTarget.unitMode.value === "linear" ? Number(e.currentTarget.widthFactor.value || 1) : 1);
    const total = Math.max(0, subtotal + Number(e.currentTarget.extraWorkCost?.value || 0) - Number(e.currentTarget.discount.value || 0));
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
  const customer = findOrCreateInvoiceCustomer(data);
  const items = getDocumentItems(e.currentTarget);
  const quantity = items.length ? items.reduce((sum, item) => sum + Number(item.count || 0), 0) : Number(data.quantity || 0);
  const unitPrice = Number(data.unitPrice || 0);
  const discount = Number(data.discount || 0);
  const extraWorkCost = Number(data.extraWorkCost || 0);
  const widthFactor = data.unitMode === "linear" ? Number(data.widthFactor || 1) : 1;
  const subtotal = items.length ? invoiceItemsSubtotal(items) : quantity * unitPrice * widthFactor;
  const total = Math.max(0, subtotal + extraWorkCost - discount);
  const paidAmount = data.paymentStatus === "paid" ? total : data.paymentStatus === "unpaid" ? 0 : Number(data.paidAmount || 0);
  const doc = {
    ...data,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerAddress: customer.address,
    id: id("d"),
    number: `${data.type === "quote" ? "Q" : "INV"}-${String(state.documents.length + 1).padStart(4, "0")}`,
    date: today(),
    createdAt: new Date().toISOString(),
    quantity,
    unitPrice,
    discount,
    extraWorkCost,
    widthFactor,
    items,
    subtotal,
    linearWidth: data.unitMode === "linear" ? data.linearWidth : "",
    paymentStatus: data.paymentStatus,
    paymentMethod: data.paymentMethod,
    paidAmount,
    total,
    orderStatus: data.orderStatus || "قيد المعاينة",
    deliveryDate: data.deliveryDate || "",
    technician: data.technician || "",
    createdBy: currentUser.id
  };
  state.documents.push(doc);
  state.orders.push({
    id: id("o"),
    documentId: doc.id,
    customerId: customer.id,
    productId: doc.productId,
    status: doc.orderStatus,
    deliveryDate: doc.deliveryDate,
    technician: doc.technician,
    notes: doc.notes,
    createdAt: today(),
    createdBy: currentUser.id
  });
  if (doc.type === "invoice") {
    const p = productById(doc.productId);
    if (p) p.quantity = Math.max(0, Number(p.quantity || 0) - quantity);
  }
  e.currentTarget.reset();
  els.invoiceItems.innerHTML = "";
  addInvoiceItemRow();
  syncCalculationFields();
  await saveState(); renderAll();
});

document.querySelector("#factoryReportForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const report = {
    ...data,
    id: id("fr"),
    number: `FR-${String(state.factoryReports.length + 1).padStart(4, "0")}`,
    amount: Number(data.amount || 0),
    dateTime: data.dateTime ? new Date(data.dateTime).toISOString() : new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: currentUser.id
  };
  state.factoryReports.push(report);
  e.currentTarget.reset();
  e.currentTarget.dateTime.value = localDateTimeValue();
  await saveState();
  renderAll();
});

document.querySelector("#supplierForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  state.suppliers.push({ ...formData(e.currentTarget), id: id("s") });
  e.currentTarget.reset();
  await saveState(); renderAll();
});

document.querySelector("#orderForm")?.addEventListener("submit", async e => {
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

document.querySelector("#orders")?.addEventListener("change", async e => {
  if (!e.target.dataset.orderStatus) return;
  const order = state.orders.find(o => o.id === e.target.dataset.orderStatus);
  order.status = e.target.value;
  await saveState(); renderAll();
});

document.querySelector("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  state = JSON.parse(await file.text());
  normalizeState();
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
      gradient.addColorStop(0.48, i % 2 ? "rgba(0,81,140,0.18)" : "rgba(255,223,31,0.24)");
      gradient.addColorStop(0.68, "rgba(0,81,140,0.08)");
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
