// Pagewise Shop - Dating JS, gumagana
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const peso = (n) => "₱" + Math.round(n || 0).toLocaleString("en-PH");

  let cart = [];
  let currentUser = null;
  let currentFilter = "all";

  function getBooks() {
    const data = Backend.getData();
    return data.titles || [];
  }

  // RENDER BOOKS
  function renderBooks() {
    const grid = $("bookGrid");
    if (!grid) return;
    const books = getBooks();
    const q = ($("searchInput") ? $("searchInput").value.toLowerCase() : "");
    const filtered = books.filter((b) => {
      const matchSearch = !q || b.title.toLowerCase().includes(q);
      const matchFilter = currentFilter === "all" || (currentFilter === "low" ? b.stock <= 10 : true);
      return matchSearch && matchFilter;
    });

    if (!filtered.length) {
      grid.innerHTML = "<p style='grid-column:1/-1;text-align:center;color:#888'>No books found.</p>";
      return;
    }

    grid.innerHTML = filtered.map((b) => `
      <article class="book-card">
        <div class="book-cover">${b.title.charAt(0)}</div>
        <h3>${b.title}</h3>
        <p class="price">${peso(b.price)}</p>
        <p class="stock">${b.stock > 0 ? b.stock + " in stock" : "Out of stock"}</p>
        <button class="btn" onclick="addToCart('${b.title.replace(/'/g, "\\'")}')" ${b.stock <= 0 ? "disabled" : ""}>Add to Cart</button>
      </article>
    `).join("");
  }

  // CART
  window.addToCart = function (title) {
    const books = getBooks();
    const book = books.find((b) => b.title === title);
    if (!book) return;
    const found = cart.find((c) => c.title === title);
    if (found) found.qty += 1;
    else cart.push({ title, price: book.price, qty: 1 });
    renderCart();
    const badge = $("cartCount");
    if (badge) badge.textContent = cart.reduce((s, c) => s + c.qty, 0);
    alert(title + " added to cart!");
  };

  function renderCart() {
    const list = $("cartItems");
    if (!list) return;
    if (!cart.length) {
      list.innerHTML = "<p style='text-align:center;color:#888'>Your cart is empty.</p>";
      if ($("cartTotal")) $("cartTotal").textContent = peso(0);
      return;
    }
    list.innerHTML = cart.map((c, i) => `
      <div class="cart-row">
        <span>${c.title}</span>
        <span>${c.qty} x ${peso(c.price)}</span>
        <span><b>${peso(c.price * c.qty)}</b></span>
        <button onclick="removeFromCart(${i})">✕</button>
      </div>
    `).join("");
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    if ($("cartTotal")) $("cartTotal").textContent = peso(total);
  }

  window.removeFromCart = function (i) {
    cart.splice(i, 1);
    renderCart();
    const badge = $("cartCount");
    if (badge) badge.textContent = cart.reduce((s, c) => s + c.qty, 0);
  };

  // LOGIN / REGISTER MODAL
  window.openLogin = function () {
    if ($("loginModal")) $("loginModal").classList.remove("hide");
  };
  window.closeLogin = function () {
    if ($("loginModal")) $("loginModal").classList.add("hide");
  };

  window.switchTab = function (tab) {
    if ($("loginTab")) $("loginTab").classList.toggle("active", tab === "login");
    if ($("registerTab")) $("registerTab").classList.toggle("active", tab === "register");
    if ($("loginForm")) $("loginForm").classList.toggle("hide", tab !== "login");
    if ($("registerForm")) $("registerForm").classList.toggle("hide", tab !== "register");
  };

  // CHECKOUT
  window.checkout = function () {
    if (!cart.length) { alert("Your cart is empty."); return; }
    if (!currentUser) { alert("Please log in first."); openLogin(); return; }
    const address = $("addressInput") ? $("addressInput").value : "";
    const payment = $("paymentSelect") ? $("paymentSelect").value : "COD";
    const deliveryFee = 50;
    let ok = true;
    cart.forEach((c) => {
      const r = Backend.placeOrder(c.title, c.qty, currentUser.email, address, payment, deliveryFee / cart.length);
      if (!r.ok) { alert(r.error); ok = false; }
    });
    if (ok) {
      alert("Order placed! Thank you.");
      cart = [];
      renderCart();
      renderBooks();
      const badge = $("cartCount");
      if (badge) badge.textContent = "0";
      if ($("cartModal")) $("cartModal").classList.add("hide");
    }
  };

  // INIT
  document.addEventListener("DOMContentLoaded", () => {
    renderBooks();
    renderCart();

    if ($("searchInput")) $("searchInput").addEventListener("input", renderBooks);

    // Filter buttons
    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        renderBooks();
      });
    });

    // Login form
    const lf = $("loginForm");
    if (lf) lf.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("loginEmail") ? $("loginEmail").value : "";
      const pass = $("loginPass") ? $("loginPass").value : "";
      const r = Backend.customerLogin(email, pass);
      if (r.ok) {
        currentUser = r.user;
        if ($("userName")) $("userName").textContent = "Hi, " + (r.user.name || r.user.email);
        if ($("loginBtn")) $("loginBtn").textContent = "Log out";
        closeLogin();
        alert("Welcome back, " + (r.user.name || r.user.email) + "!");
      } else {
        alert(r.error);
      }
    });

    // Register form
    const rf = $("registerForm");
    if (rf) rf.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("regName") ? $("regName").value : "";
      const email = $("regEmail") ? $("regEmail").value : "";
      const pass = $("regPass") ? $("regPass").value : "";
      const r = Backend.customerRegister(name, email, pass);
      if (r.ok) {
        alert("Account created! Please log in.");
        switchTab("login");
      } else {
        alert(r.error);
      }
    });

    // Cart modal
    if ($("cartBtn")) $("cartBtn").addEventListener("click", () => {
      if ($("cartModal")) $("cartModal").classList.remove("hide");
    });
    if ($("closeCart")) $("closeCart").addEventListener("click", () => {
      if ($("cartModal")) $("cartModal").classList.add("hide");
    });

    // Checkout button
    if ($("checkoutBtn")) $("checkoutBtn").addEventListener("click", checkout);
  });
})();
