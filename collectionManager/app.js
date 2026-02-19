// Same-origin API (no Netlify)
const API_BASE = "/api";
const BOOKS_API = `${API_BASE}/books`;

let currentPage = 1;
let totalRecords = 0;
let pageSize = 10;
let totalPages = 1;

let currentQuery = "";
let currentCategory = "";
let currentSortBy = "created_at";
let currentSortDir = "desc";

const listView = document.getElementById("listView");
const pageIndicator = document.getElementById("pageIndicator");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const formSection = document.getElementById("formSection");
const formTitle = document.getElementById("formTitle");
const bookForm = document.getElementById("bookForm");

const bookId = document.getElementById("bookId");
const titleInput = document.getElementById("title");
const authorInput = document.getElementById("author");
const yearInput = document.getElementById("year");
const categoryInput = document.getElementById("category");
const ratingInput = document.getElementById("rating");
const priceInput = document.getElementById("price");
const imageUrlInput = document.getElementById("imageUrl");

const titleErr = document.getElementById("titleErr");
const authorErr = document.getElementById("authorErr");
const yearErr = document.getElementById("yearErr");
const categoryErr = document.getElementById("categoryErr");
const ratingErr = document.getElementById("ratingErr");
const priceErr = document.getElementById("priceErr");
const imageErr = document.getElementById("imageErr");
const serverErr = document.getElementById("serverErr");

const statusEl = document.getElementById("status");

const searchInput = document.getElementById("searchInput");
const categorySelect = document.getElementById("categorySelect");
const sortSelect = document.getElementById("sortSelect");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const applyBtn = document.getElementById("applyBtn");
const clearBtn = document.getElementById("clearBtn");

document.getElementById("openAddBtn").addEventListener("click", openFormForAdd);
document.getElementById("cancelBtn").addEventListener("click", closeForm);
prevBtn.addEventListener("click", () => loadPage(currentPage - 1));
nextBtn.addEventListener("click", () => loadPage(currentPage + 1));

applyBtn.addEventListener("click", () => {
  currentQuery = searchInput.value.trim();
  currentCategory = categorySelect.value;
  const [sb, sd] = sortSelect.value.split(":");
  currentSortBy = sb;
  currentSortDir = sd;
  pageSize = Number(pageSizeSelect.value);
  setCookie("pageSize", String(pageSize), 365);
  loadPage(1);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  categorySelect.value = "";
  sortSelect.value = "created_at:desc";

  currentQuery = "";
  currentCategory = "";
  currentSortBy = "created_at";
  currentSortDir = "desc";
  loadPage(1);
});

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}
function clearStatus() {
  if (!statusEl) return;
  statusEl.textContent = "";
  statusEl.classList.add("hidden");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries help with Render cold starts / temporary 502/503 while waking
async function fetchWithBackendWait(url, options = {}, attempts = 6) {
  let lastError = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      setStatus("Waiting on backend server to start…");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      // ✅ fixed spread bug
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      clearStatus();
      return res;
    } catch (err) {
      lastError = err;
      await sleep(1500);
    }
  }

  clearStatus();
  throw lastError;
}

function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const parts = document.cookie.split(";").map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.substring(name.length + 1));
  }
  return "";
}

function clearErrors() {
  titleErr.textContent = "";
  authorErr.textContent = "";
  yearErr.textContent = "";
  categoryErr.textContent = "";
  ratingErr.textContent = "";
  priceErr.textContent = "";
  imageErr.textContent = "";
  serverErr.textContent = "";
}

function clientValidate({ title, author, year, rating, price }) {
  clearErrors();
  let ok = true;

  if (!title.trim()) { titleErr.textContent = "Title is required."; ok = false; }
  if (!author.trim()) { authorErr.textContent = "Author is required."; ok = false; }

  const y = Number(year);
  if (!Number.isFinite(y)) { yearErr.textContent = "Year is required."; ok = false; }
  else if (y < 0 || y > 2100) { yearErr.textContent = "Year must be 0–2100."; ok = false; }

  const r = Number(rating);
  if (!Number.isFinite(r)) { ratingErr.textContent = "Rating is required."; ok = false; }
  else if (r < 0 || r > 5) { ratingErr.textContent = "Rating must be 0–5."; ok = false; }

  const pr = Number(price);
  if (!Number.isFinite(pr)) { priceErr.textContent = "Price is required."; ok = false; }
  else if (pr < 0) { priceErr.textContent = "Price must be >= 0."; ok = false; }

  return ok;
}

function openFormForAdd() {
  clearErrors();
  formTitle.textContent = "Add Book";
  bookId.value = "";
  titleInput.value = "";
  authorInput.value = "";
  yearInput.value = "";
  categoryInput.value = "Other";
  ratingInput.value = "3.5";
  priceInput.value = "9.99";
  imageUrlInput.value = "";
  formSection.classList.remove("hidden");
  titleInput.focus();
}

function openFormForEdit(book) {
  clearErrors();
  formTitle.textContent = "Edit Book";
  bookId.value = book.id;
  titleInput.value = book.title;
  authorInput.value = book.author;
  yearInput.value = book.year;
  categoryInput.value = book.category || "Other";
  ratingInput.value = book.rating ?? 0;
  priceInput.value = book.price ?? 0;
  imageUrlInput.value = book.imageUrl || "";
  formSection.classList.remove("hidden");
  titleInput.focus();
}

function closeForm() {
  formSection.classList.add("hidden");
}

function buildQueryString(page) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  if (currentQuery) params.set("q", currentQuery);
  if (currentCategory) params.set("category", currentCategory);

  params.set("sortBy", currentSortBy);
  params.set("sortDir", currentSortDir);

  return params.toString();
}

async function loadPage(page) {
  if (page < 1) page = 1;

  try {
    const qs = buildQueryString(page);
    const res = await fetchWithBackendWait(`${BOOKS_API}?${qs}`);
    const data = await res.json();

    totalRecords = data.total;
    pageSize = data.pageSize;
    totalPages = data.totalPages;

    currentPage = Math.min(Math.max(1, data.page), totalPages);

    renderList(data.items);
    updatePagingUI();
  } catch (e) {
    listView.innerHTML = `
      <div class="empty card">
        <h2>Could not load books</h2>
        <p>The backend may be starting up. Try refreshing in a moment.</p>
      </div>
    `;
    console.error(e);
  }
}

function updatePagingUI() {
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages} • Total ${totalRecords}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

function renderList(items) {
  listView.innerHTML = "";

  if (!items.length) {
    listView.innerHTML = `
      <div class="empty card">
        <h2>No results</h2>
        <p>Try clearing filters or searching something else.</p>
      </div>
    `;
    return;
  }

  items.forEach((book) => {
    const card = document.createElement("article");
    card.className = "bookCard";
    card.innerHTML = `
      <div class="thumbWrap">
        <img class="thumb" src="${escapeHtml(book.imageUrl || "")}" alt="Cover"
             onerror="this.src='https://placehold.co/160x220?text=Missing'">
      </div>
      <div class="bookInfo">
        <h3 class="bookTitle">${escapeHtml(book.title)}</h3>
        <p class="muted">${escapeHtml(book.author)} • ${book.year}</p>
        <p class="meta">
          <span class="pill">${escapeHtml(book.category || "Other")}</span>
          <span class="pill">⭐ ${Number(book.rating).toFixed(1)}</span>
          <span class="pill">$${Number(book.price).toFixed(2)}</span>
        </p>
        <div class="actions">
          <button type="button" class="secondary" data-edit="${book.id}">Edit</button>
          <button type="button" class="danger" data-del="${book.id}">Delete</button>
        </div>
      </div>
    `;
    listView.appendChild(card);
  });

  listView.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-edit"));
      // Quick: fetch current page items already loaded? easiest: find from DOM list
      // But to keep it reliable, re-fetch current page and find item.
      try {
        const qs = buildQueryString(currentPage);
        const res = await fetchWithBackendWait(`${BOOKS_API}?${qs}`);
        const data = await res.json();
        const book = data.items.find(b => b.id === id);
        if (book) openFormForEdit(book);
      } catch (err) {
        console.error(err);
        alert("Backend is still starting. Please try again.");
      }
    });
  });

  listView.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-del"));
      await deleteBook(id);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

bookForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    title: titleInput.value,
    author: authorInput.value,
    year: yearInput.value,
    category: categoryInput.value,
    rating: ratingInput.value,
    price: priceInput.value,
    imageUrl: imageUrlInput.value
  };

  if (!clientValidate(payload)) return;

  try {
    clearErrors();

    const id = bookId.value ? Number(bookId.value) : null;
    const url = id ? `${BOOKS_API}/${id}` : BOOKS_API;
    const method = id ? "PUT" : "POST";

    const res = await fetchWithBackendWait(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      serverErr.textContent = result.error || "Server error.";
      return;
    }

    closeForm();
    await loadPage(currentPage);
  } catch (err) {
    serverErr.textContent = "Request failed. Try again.";
    console.error(err);
  }
});

async function deleteBook(id) {
  if (!confirm("Are you sure you want to delete this book?")) return;

  try {
    const res = await fetchWithBackendWait(`${BOOKS_API}/${id}`, { method: "DELETE" });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(result.error || "Delete failed.");
      return;
    }

    // If we deleted the last item on the last page, step back if needed
    const afterDeleteTotal = Math.max(0, totalRecords - 1);
    const totalPagesAfter = Math.max(1, Math.ceil(afterDeleteTotal / pageSize));
    if (currentPage > totalPagesAfter) currentPage = totalPagesAfter;

    await loadPage(currentPage);
  } catch (err) {
    alert("Delete request failed.");
    console.error(err);
  }
}

async function initControls() {
  // restore page size from cookie
  const saved = Number(getCookie("pageSize"));
  if ([5, 10, 20, 50].includes(saved)) {
    pageSize = saved;
    pageSizeSelect.value = String(saved);
  } else {
    setCookie("pageSize", String(pageSize), 365);
  }

  // load meta (categories)
  try {
    const res = await fetchWithBackendWait(`${API_BASE}/meta`);
    const meta = await res.json();

    // categories
    categorySelect.innerHTML = `<option value="">All</option>` + meta.categories
      .map(c => `<option value="${c}">${c}</option>`).join("");

  } catch (e) {
    // If meta fails, keep basic UI working
    console.warn("meta failed", e);
  }
}

window.onload = async () => {
  await initControls();
  await loadPage(1);
};
