import os
import math
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime, func
)
from sqlalchemy.orm import declarative_base, sessionmaker

app = Flask(__name__)

# ---------- DB ----------
def _get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        # Local dev fallback example:
        # export DATABASE_URL="postgresql://postgres:password@localhost:5432/books"
        raise RuntimeError("DATABASE_URL is not set. Put it in environment variables.")
    # Render sometimes provides postgres://...; SQLAlchemy wants postgresql://...
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url

DATABASE_URL = _get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

PLACEHOLDER_IMG = "https://placehold.co/160x220?text=Book"

ALLOWED_PAGE_SIZES = {5, 10, 20, 50}
ALLOWED_SORT_FIELDS = {"title", "author", "year", "rating", "price", "created_at"}

CATEGORY_OPTIONS = [
    "Fantasy", "Sci-Fi", "Classic", "Horror", "Mystery", "Non-Fiction", "Other"
]

class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    author = Column(String(255), nullable=False)
    year = Column(Integer, nullable=False)
    category = Column(String(80), nullable=False, default="Other")
    rating = Column(Float, nullable=False, default=0.0)  # 0–5
    price = Column(Float, nullable=False, default=0.0)   # >= 0
    image_url = Column(String(1000), nullable=False, default=PLACEHOLDER_IMG)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

def book_to_dict(b: Book):
    return {
        "id": b.id,
        "title": b.title,
        "author": b.author,
        "year": b.year,
        "category": b.category,
        "rating": round(float(b.rating or 0.0), 2),
        "price": round(float(b.price or 0.0), 2),
        "imageUrl": b.image_url,
        "createdAt": b.created_at.isoformat() if b.created_at else None,
    }

def _safe_int(val, default=None):
    try:
        return int(val)
    except Exception:
        return default

def _safe_float(val, default=None):
    try:
        return float(val)
    except Exception:
        return default

def validate_book_payload(data: dict):
    title = str(data.get("title", "")).strip()
    author = str(data.get("author", "")).strip()
    year = _safe_int(data.get("year", None), default=None)

    category = str(data.get("category", "Other")).strip() or "Other"
    rating = _safe_float(data.get("rating", 0), default=None)
    price = _safe_float(data.get("price", 0), default=None)

    image_url = str(data.get("imageUrl", "")).strip()

    if not title:
        return "Title is required.", None
    if not author:
        return "Author is required.", None
    if year is None:
        return "Year is required (number).", None
    if year < 0 or year > 2100:
        return "Year must be between 0 and 2100.", None

    if category not in CATEGORY_OPTIONS:
        # Keep it permissive but consistent
        category = "Other"

    if rating is None:
        return "Rating must be a number.", None
    if rating < 0 or rating > 5:
        return "Rating must be 0–5.", None

    if price is None:
        return "Price must be a number.", None
    if price < 0:
        return "Price must be >= 0.", None

    if not image_url:
        image_url = PLACEHOLDER_IMG

    cleaned = {
        "title": title,
        "author": author,
        "year": year,
        "category": category,
        "rating": float(rating),
        "price": float(price),
        "image_url": image_url,
    }
    return None, cleaned

def seed_if_needed():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        count = db.query(func.count(Book.id)).scalar() or 0
        if count >= 30:
            return

        # Seed from your old books.json if present (30 items already)
        json_path = os.path.join(os.path.dirname(__file__), "books.json")
        seed_rows = []
        if os.path.exists(json_path):
            import json
            with open(json_path, "r", encoding="utf-8") as f:
                seed_rows = json.load(f)  # [{id,title,author,year}, ...]

        # Fallback minimal seed if file missing
        if not seed_rows:
            seed_rows = [
                {"title": "The Hobbit", "author": "J.R.R. Tolkien", "year": 1937},
                {"title": "1984", "author": "George Orwell", "year": 1949},
            ]

        # Insert until we reach 30
        inserted = 0
        for i, row in enumerate(seed_rows, start=1):
            # Make deterministic “domain” fields
            category = CATEGORY_OPTIONS[i % len(CATEGORY_OPTIONS)]
            rating = round(((i * 37) % 50) / 10, 1)  # 0.0–4.9
            price = round(5 + ((i * 19) % 300) / 10, 2)  # 5.00–34.90
            img = f"https://placehold.co/160x220?text=Book+{i}"

            b = Book(
                title=row.get("title", f"Book {i}"),
                author=row.get("author", "Unknown"),
                year=int(row.get("year", 2000)),
                category=category,
                rating=rating,
                price=price,
                image_url=img,
            )
            db.add(b)
            inserted += 1

        db.commit()
        # If still < 30, top up
        count2 = db.query(func.count(Book.id)).scalar() or 0
        while count2 < 30:
            i = count2 + 1
            b = Book(
                title=f"Seed Book {i}",
                author="Seed Author",
                year=2000 + (i % 20),
                category="Other",
                rating=3.5,
                price=9.99,
                image_url=f"https://placehold.co/160x220?text=Seed+{i}",
            )
            db.add(b)
            db.commit()
            count2 += 1
    finally:
        db.close()

seed_if_needed()

# ---------- Static frontend (no Netlify) ----------
@app.route("/")
def root():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def static_files(path):
    # serves index.html, stats.html, app.js, style.css from same folder
    return send_from_directory(".", path)

# ---------- API ----------
@app.route("/api/meta", methods=["GET"])
def meta():
    return jsonify({
        "pageSizes": sorted(list(ALLOWED_PAGE_SIZES)),
        "categories": CATEGORY_OPTIONS,
        "sortFields": sorted(list(ALLOWED_SORT_FIELDS)),
        "placeholderImage": PLACEHOLDER_IMG
    })

@app.route("/api/books", methods=["GET"])
def get_books():
    page = _safe_int(request.args.get("page", 1), default=1)
    page_size = _safe_int(request.args.get("pageSize", 10), default=10)
    q = str(request.args.get("q", "")).strip()
    category = str(request.args.get("category", "")).strip()
    sort_by = str(request.args.get("sortBy", "created_at")).strip()
    sort_dir = str(request.args.get("sortDir", "desc")).strip().lower()

    if page < 1:
        page = 1
    if page_size not in ALLOWED_PAGE_SIZES:
        page_size = 10
    if sort_by not in ALLOWED_SORT_FIELDS:
        sort_by = "created_at"
    if sort_dir not in {"asc", "desc"}:
        sort_dir = "desc"

    db = SessionLocal()
    try:
        query = db.query(Book)

        if q:
            like = f"%{q}%"
            query = query.filter(
                (Book.title.ilike(like)) | (Book.author.ilike(like))
            )

        if category:
            query = query.filter(Book.category == category)

        total = query.with_entities(func.count(Book.id)).scalar() or 0

        sort_col = getattr(Book, sort_by)
        query = query.order_by(sort_col.asc() if sort_dir == "asc" else sort_col.desc())

        offset = (page - 1) * page_size
        items = query.offset(offset).limit(page_size).all()

        # clamp page if out of range after deletes
        total_pages = max(1, math.ceil(total / page_size)) if total else 1
        if page > total_pages and total > 0:
            page = total_pages

        return jsonify({
            "items": [book_to_dict(b) for b in items],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": total_pages
        })
    finally:
        db.close()

@app.route("/api/books", methods=["POST"])
def create_book():
    data = request.get_json(silent=True) or {}
    err, cleaned = validate_book_payload(data)
    if err:
        return jsonify({"error": err}), 400

    db = SessionLocal()
    try:
        b = Book(**cleaned)
        db.add(b)
        db.commit()
        db.refresh(b)
        return jsonify(book_to_dict(b)), 201
    finally:
        db.close()

@app.route("/api/books/<int:book_id>", methods=["PUT"])
def update_book(book_id):
    data = request.get_json(silent=True) or {}
    err, cleaned = validate_book_payload(data)
    if err:
        return jsonify({"error": err}), 400

    db = SessionLocal()
    try:
        b = db.query(Book).filter(Book.id == book_id).first()
        if not b:
            return jsonify({"error": "Book not found."}), 404

        for k, v in cleaned.items():
            setattr(b, k, v)

        db.commit()
        db.refresh(b)
        return jsonify(book_to_dict(b))
    finally:
        db.close()

@app.route("/api/books/<int:book_id>", methods=["DELETE"])
def delete_book(book_id):
    db = SessionLocal()
    try:
        b = db.query(Book).filter(Book.id == book_id).first()
        if not b:
            return jsonify({"error": "Book not found."}), 404
        db.delete(b)
        db.commit()
        return jsonify({"ok": True})
    finally:
        db.close()

@app.route("/api/stats", methods=["GET"])
def stats():
    page_size = _safe_int(request.args.get("pageSize", 10), default=10)
    if page_size not in ALLOWED_PAGE_SIZES:
        page_size = 10

    db = SessionLocal()
    try:
        total = db.query(func.count(Book.id)).scalar() or 0
        avg_year = db.query(func.avg(Book.year)).scalar() or 0
        avg_rating = db.query(func.avg(Book.rating)).scalar() or 0
        total_value = db.query(func.sum(Book.price)).scalar() or 0

        # count by category
        rows = db.query(Book.category, func.count(Book.id)).group_by(Book.category).all()
        count_by_category = {cat: int(cnt) for (cat, cnt) in rows}

        return jsonify({
            "total": int(total),
            "pageSize": int(page_size),
            "averagePublicationYear": int(round(avg_year)) if total else 0,
            "averageRating": round(float(avg_rating or 0), 2),
            "totalValue": round(float(total_value or 0), 2),
            "countByCategory": count_by_category
        })
    finally:
        db.close()
