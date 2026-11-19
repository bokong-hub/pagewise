/* Pagewise Books – static JS "backend" (runs in the browser, no server). Provides: auth, a localStorage data store, and predictive analytics. Demo login: admin / Pagewise@2026 NOTE: this is client-side only. Anyone can read this file, so it is NOT real security. Swap the functions marked "API" for fetch() calls to a real server before storing anything private. */
const Backend = (() => {
  const SALT = "pagewise::";
  const USER = { name: "admin", hash: "8464d0958a78af17e3b50eff94382ea9c698a68e384b356935fe531c597b3f53" };
  const KEY = "pw_data_v1", SESSION = "pw_session", LOCK = "pw_lock";
  const CUSTOMERS_KEY = "pw_customers", CUSTOMER_SESSION = "pw_customer";
  const ORDERS_KEY = "pw_orders_v1"; // <-- BAGONG DAGDAG LANG
  const SESSION_MS = 30 * 60 * 1000, MAX_TRIES = 5, LOCK_MS = 5 * 60 * 1000;
  const read = (s, k) => { try { return JSON.parse(s.getItem(k)); } catch { return null; } };
  const write = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch {} };
  async function sha256(text) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }

  /* ---------- ADMIN AUTH (API) ---------- */
  async function login(user, pass) {
    const lock = read(localStorage, LOCK) || { tries: 0, until: 0 };
    if (Date.now() < lock.until) { return { ok: false, error: `Too many attempts. Try again in ${Math.ceil((lock.until - Date.now()) / 60000)} min.` }; }
    if (!crypto.subtle) return { ok: false, error: "Login needs HTTPS or localhost." };
    const good = user.trim() === USER.name && (await sha256(SALT + pass)) === USER.hash;
    if (!good) { lock.tries++; if (lock.tries >= MAX_TRIES) { lock.until = Date.now() + LOCK_MS; lock.tries = 0; } write(localStorage, LOCK, lock); return { ok: false, error: "Wrong username or password." }; }
    write(localStorage, LOCK, { tries: 0, until: 0 });
    write(sessionStorage, SESSION, { user: USER.name, exp: Date.now() + SESSION_MS });
    return { ok: true };
  }
  const isAuthed = () => { const s = read(sessionStorage, SESSION); return !!(s && s.exp > Date.now()); };
  const logout = () => { try { sessionStorage.removeItem(SESSION); } catch {} };

  /* ---------- CUSTOMER AUTH ---------- */
  function getCustomers() { return read(localStorage, CUSTOMERS_KEY) || []; }
  function saveCustomers(list) { write(localStorage, CUSTOMERS_KEY, list); }
  async function customerRegister(email, password) {
    email = email.trim().toLowerCase();
    if (!email || !password) return { ok: false, error: "Email and password are required." };
    if (password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
    const customers = getCustomers();
    if (customers.find(c => c.email === email)) { return { ok: false, error: "An account with this email already exists." }; }
    const hash = await sha256(SALT + password);
    customers.push({ email, hash, created: Date.now() });
    saveCustomers(customers);
    write(localStorage, CUSTOMER_SESSION, { email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return { ok: true };
  }
  async function customerLogin(email, password) {
    email = email.trim().toLowerCase();
    if (!email || !password) return { ok: false, error: "Email and password are required." };
    const customers = getCustomers();
    const user = customers.find(c => c.email === email);
    if (!user) return { ok: false, error: "No account found with this email." };
    const hash = await sha256(SALT + password);
    if (hash !== user.hash) return { ok: false, error: "Incorrect password." };
    write(localStorage, CUSTOMER_SESSION, { email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return { ok: true };
  }
  function customerLogout() { try { localStorage.removeItem(CUSTOMER_SESSION); } catch {} }
  function isCustomerLoggedIn() { const s = read(localStorage, CUSTOMER_SESSION); return !!(s && s.exp > Date.now()); }
  function getCurrentCustomer() { const s = read(localStorage, CUSTOMER_SESSION); return (s && s.exp > Date.now()) ? s.email : null; }

  /* ---------- DATA STORE (API) ---------- */
  const monthLabels = () => { const out = [], d = new Date(); for (let i = 11; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(m.toLocaleString("en", { month: "short" })); } return out; };
  function seed() {
    let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const titles = [
      ["The Lantern Keeper", 420, 38, 30, 1.6],
      ["Salt & Hollow Hills", 380, 22, 24, 0.4],
      ["A Quiet Orchard", 450, 15, 18, -0.3],
      ["Midnight at the Station", 399, 60, 20, 1.1],
    ].map(([title, price, stock, base, trend]) => ({ title, price, stock, units: Array.from({ length: 12 }, (_, i) => Math.max(2, Math.round(base + trend * i + (i % 12 > 9 ? 6 : 0) + (rnd() - 0.5) * 8))), }));
    return { titles };
  }
  function load() { let d = read(localStorage, KEY); if (!d) { d = seed(); write(localStorage, KEY, d); } return d; }
  const getData = () => ({ ...load(), months: monthLabels() });
  function addSale(title, qty) {
    const d = load(), t = d.titles.find(x => x.title === title);
    if (!t || !(qty > 0)) return false;
    t.units[11] += qty; t.stock = Math.max(0, t.stock - qty);
    write(localStorage, KEY, d); return true;
  }
  function restock(title, qty) {
    const d = load(), t = d.titles.find(x => x.title === title);
    if (!t || !(qty > 0)) return false;
    t.stock += qty; write(localStorage, KEY, d); return true;
  }
  const reset = () => { write(localStorage, KEY, seed()); write(localStorage, ORDERS_KEY, seedOrders()); };

  /* ---------- ORDERS - BAGONG DAGDAG LANG, HINDI BINURA YUNG LUMA ---------- */
  // Ito yung database ng orders niyo. Kayo-kayo lang na peke na tao.
  function seedOrders() {
    const now = Date.now();
    const day = 24*60*60*1000;
    return [
      { id: "PW-1001", customer: "Juan Dela Cruz", email: "juan@test.com", title: "The Lantern Keeper", qty: 2, price: 420, total: 840, status: "Delivered", date: now - 6*day },
      { id: "PW-1002", customer: "Maria Santos", email: "maria@test.com", title: "Midnight at the Station", qty: 1, price: 399, total: 399, status: "Delivered", date: now - 5*day },
      { id: "PW-1003", customer: "Jose Rizal", email: "jose@test.com", title: "Salt & Hollow Hills", qty: 3, price: 380, total: 1140, status: "Shipped", date: now - 3*day },
      { id: "PW-1004", customer: "Ana Reyes", email: "ana@test.com", title: "A Quiet Orchard", qty: 1, price: 450, total: 450, status: "Pending", date: now - 1*day },
      { id: "PW-1005", customer: "Pedro Penduko", email: "pedro@test.com", title: "The Lantern Keeper", qty: 1, price: 420, total: 420, status: "Pending", date: now },
    ];
  }
  function getOrders() {
    let o = read(localStorage, ORDERS_KEY);
    if (!o) { o = seedOrders(); write(localStorage, ORDERS_KEY, o); }
    return o;
  }
  function addOrder(order) {
    const orders = getOrders();
    const id = "PW-" + (1000 + orders.length + 1);
    const newOrder = { id, date: Date.now(), status: "Pending", ...order, total: order.qty * order.price };
    orders.unshift(newOrder);
    write(localStorage, ORDERS_KEY, orders);
    // Sabay update din yung lumang graph data mo para hindi masira
    addSale(order.title, order.qty);
    return newOrder;
  }
  function updateOrderStatus(id, status) {
    const orders = getOrders();
    const o = orders.find(x => x.id === id);
    if (!o) return false;
    o.status = status;
    write(localStorage, ORDERS_KEY, orders);
    return true;
  }
  function getOrderStats() {
    const orders = getOrders();
    const totalRevenue = orders.reduce((s,o)=>s+o.total,0);
    const totalOrders = orders.length;
    const pending = orders.filter(o=>o.status==="Pending").length;
    // Para sa graph: benta per araw (last 7 days)
    const last7 = [];
    for(let i=6;i>=0;i--){
      const d = new Date(Date.now() - i*24*60*60*1000);
      const label = d.toLocaleDateString("en", {month:"short", day:"numeric"});
      const dayTotal = orders.filter(o=>{
        const od = new Date(o.date);
        return od.toDateString() === d.toDateString();
      }).reduce((s,o)=>s+o.total,0);
      last7.push({ label, total: dayTotal });
    }
    return { totalRevenue, totalOrders, pending, last7 };
  }

  /* ---------- PREDICTIVE ANALYTICS ---------- */
  function linreg(y) { const n = y.length, xs = y.map((_, i) => i); const mx = xs.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let num = 0, den = 0; xs.forEach((x, i) => { num += (x - mx) * (y[i] - my); den += (x - mx) ** 2; }); const b = den ? num / den : 0, a = my - b * mx; const sd = Math.sqrt(y.reduce((s, v, i) => s + (v - (a + b * i)) ** 2, 0) / Math.max(1, n - 2)); return { a, b, sd }; }
  function forecast(y, h = 3) { const { a, b, sd } = linreg(y), n = y.length; return Array.from({ length: h }, (_, k) => { const v = Math.max(0, a + b * (n + k)); return { value: v, lo: Math.max(0, v - 1.28 * sd), hi: v + 1.28 * sd }; }); }
  const movingAvg = (y, w = 3) => y.map((_, i) => { const s = y.slice(Math.max(0, i - w + 1), i + 1); return s.reduce((a, b) => a + b) / s.length; });
  function analytics(h = 3) {
    const { titles, months } = getData();
    const revenue = months.map((_, i) => titles.reduce((s, t) => s + t.units[i] * t.price, 0));
    const rev = { actual: revenue, trend: movingAvg(revenue), next: forecast(revenue, h), slope: linreg(revenue).b };
    const perTitle = titles.map(t => { const f = forecast(t.units, 1)[0], slope = linreg(t.units).b; const demand = Math.round(f.value), lead = 1.5; const need = Math.max(0, Math.ceil(demand * lead - t.stock)); return { title: t.title, stock: t.stock, last: t.units[11], demand, trend: slope > 0.3 ? "rising" : slope < -0.3 ? "falling" : "steady", monthsLeft: demand ? t.stock / demand : Infinity, reorder: need, }; });
    return { months, rev, perTitle };
  }

  /* ---------- CUSTOMER PROFILE ---------- */
  function getCustomerProfile() { const email = getCurrentCustomer(); if (!email) return null; const customers = getCustomers(); return customers.find(c => c.email === email) || null; }
  function updateCustomerProfile(username) {
    const email = getCurrentCustomer(); if (!email) return { ok: false, error: "Not logged in." };
    username = username.trim();
    if (!username || username.length < 2) { return { ok: false, error: "Username must be at least 2 characters." }; }
    if (username.length > 20) { return { ok: false, error: "Username is too long (max 20 characters)." }; }
    const customers = getCustomers(); const user = customers.find(c => c.email === email);
    if (!user) return { ok: false, error: "Account not found." };
    if (customers.some(c => c.username && c.username.toLowerCase() === username.toLowerCase() && c.email !== email)) { return { ok: false, error: "This username is already taken." }; }
    user.username = username; saveCustomers(customers); return { ok: true };
  }
  function hasProfile() { const profile = getCustomerProfile(); return !!(profile && profile.username); }

  return { login, logout, isAuthed, getData, addSale, restock, reset, analytics,
    customerRegister, customerLogin, customerLogout, isCustomerLoggedIn, getCurrentCustomer,
    getCustomerProfile, updateCustomerProfile, hasProfile,
    // BAGONG DAGDAG LANG:
    getOrders, addOrder, updateOrderStatus, getOrderStats
  };
})();
