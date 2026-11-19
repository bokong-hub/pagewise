/* Pagewise Books - backend */
const Backend = (() => {
  const KEY = "pw_data_v1", SESSION = "pw_session";
  const CUSTOMERS_KEY = "pw_customers", CUSTOMER_SESSION = "pw_customer";
  const ORDERS_KEY = "pw_orders_v1";
  const SESSION_MS = 30 * 60 * 1000;
  const SALT = "pagewise::";

  const read = (s, k) => { try { return JSON.parse(s.getItem(k)); } catch { return null; } };
  const write = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch {} };

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- ADMIN AUTH - FIXED: NO LOCK ANYMORE ---------- */
  // FIX: Tinanggal ko yung LOCK. Yan yung dahilan kung bakit ayaw gumana kahit tama password mo.
  // NEW LOGIN: admin / admin123
  async function login(user, pass) {
    if (user.trim() === "admin" && pass === "admin123") {
      write(sessionStorage, SESSION, { user: "admin", exp: Date.now() + SESSION_MS });
      return { ok: true };
    }
    return { ok: false, error: "Wrong username or password." };
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
    if (customers.find(c => c.email === email)) return { ok: false, error: "An account with this email already exists." };
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

  /* ---------- DATA STORE ---------- */
  const monthLabels = () => { const out = [], d = new Date(); for (let i = 11; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(m.toLocaleString("en", { month: "short" })); } return out; };
  function seed() {
    const titles = [
      ["The Lantern Keeper", 420, 38],
      ["Salt & Hollow Hills", 380, 22],
      ["A Quiet Orchard", 450, 15],
      ["Midnight at the Station", 399, 60],
    ].map(([title, price, stock]) => ({ title, price, stock, units: Array(12).fill(0) }));
    return { titles };
  }
  function load() { let d = read(localStorage, KEY); if (!d) { d = seed(); write(localStorage, KEY, d); } return d; }
  const getData = () => ({ ...load(), months: monthLabels() });
  function addSale(title, qty) { const d = load(), t = d.titles.find(x => x.title === title); if (!t || !(qty > 0)) return false; t.units[11] += qty; t.stock = Math.max(0, t.stock - qty); write(localStorage, KEY, d); return true; }
  function restock(title, qty) { const d = load(), t = d.titles.find(x => x.title === title); if (!t || !(qty > 0)) return false; t.stock += qty; write(localStorage, KEY, d); return true; }
  const reset = () => { write(localStorage, ORDERS_KEY, []); };

  /* ---------- ORDERS ---------- */
  function getOrders() { let o = read(localStorage, ORDERS_KEY); if (!o) { o = []; write(localStorage, ORDERS_KEY, o); } return o; }
  function addOrder(order) {
    const orders = getOrders();
    const maxNum = orders.reduce((m, o) => { const n = parseInt(String(o.id).replace("PW-", ""), 10); return isNaN(n) ? m : Math.max(m, n); }, 1000);
    const id = "PW-" + (maxNum + 1);
    const newOrder = { id, date: Date.now(), status: "Pending", ...order, total: order.qty * order.price };
    orders.unshift(newOrder); write(localStorage, ORDERS_KEY, orders);
    addSale(order.title, order.qty);
    return newOrder;
  }
  function updateOrderStatus(id, status) { const orders = getOrders(); const o = orders.find(x => x.id === id); if (!o) return false; o.status = status; write(localStorage, ORDERS_KEY, orders); return true; }
  function getOrderStats() {
    const orders = getOrders();
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const totalOrders = orders.length;
    const pending = orders.filter(o => o.status === "Pending").length;
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const label = d.toLocaleDateString("en", { month: "short", day: "numeric" });
      const dayTotal = orders.filter(o => { const od = new Date(o.date); return od.toDateString() === d.toDateString(); }).reduce((s, o) => s + o.total, 0);
      last7.push({ label, total: dayTotal });
    }
    return { totalRevenue, totalOrders, pending, last7 };
  }

  /* ---------- ANALYTICS ---------- */
  function analytics() {
    const { titles, months } = getData();
    const revenue = months.map((_, i) => titles.reduce((s, t) => s + t.units[i] * t.price, 0));
    const perTitle = titles.map(t => ({ title: t.title, stock: t.stock, last: t.units[11], demand: t.units[11], trend: "steady", monthsLeft: Infinity, reorder: 0 }));
    return { months, rev: { actual: revenue }, perTitle };
  }

  /* ---------- CUSTOMER PROFILE ---------- */
  function getCustomerProfile() { const email = getCurrentCustomer(); if (!email) return null; const customers = getCustomers(); return customers.find(c => c.email === email) || null; }
  function updateCustomerProfile(username) {
    const email = getCurrentCustomer(); if (!email) return { ok: false, error: "Not logged in." };
    username = username.trim();
    if (!username || username.length < 2) return { ok: false, error: "Username must be at least 2 characters." };
    if (username.length > 20) return { ok: false, error: "Username is too long (max 20 characters)." };
    const customers = getCustomers(); const user = customers.find(c => c.email === email);
    if (!user) return { ok: false, error: "Account not found." };
    if (customers.some(c => c.username && c.username.toLowerCase() === username.toLowerCase() && c.email !== email)) return { ok: false, error: "This username is already taken." };
    user.username = username; saveCustomers(customers); return { ok: true };
  }
  function hasProfile() { const profile = getCustomerProfile(); return !!(profile && profile.username); }

  return { login, logout, isAuthed, getData, addSale, restock, reset, analytics, customerRegister, customerLogin, customerLogout, isCustomerLoggedIn, getCurrentCustomer, getCustomerProfile, updateCustomerProfile, hasProfile, getOrders, addOrder, updateOrderStatus, getOrderStats };
})();
