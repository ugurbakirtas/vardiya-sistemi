const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/uploads/') },
    filename: function (req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)) }
});
const upload = multer({ storage: storage });

const db = new sqlite3.Database('./magaza.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT UNIQUE, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS menus (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, old_price REAL, badge TEXT, image TEXT, category TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT, email TEXT, phone TEXT, address TEXT, total REAL, items TEXT, status TEXT DEFAULT 'Yeni Sipariş', payment_method TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, message TEXT, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS newsletter (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, discount_percent INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, name TEXT, rating INTEGER, comment TEXT, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS product_notes (product_id INTEGER PRIMARY KEY, top TEXT, heart TEXT, base TEXT, description TEXT)`);

    setTimeout(() => {
        const settings = [
            { key: 'top_bar_text', value: 'UBRÉL PARFUMS - Lüksün Yeni Tanımı' },
            { key: 'logo_url', value: '/uploads/logo.png' },
            { key: 'slider_img', value: 'https://placehold.co/1200x400/000000/d4af37.png?text=UBREL+PARFUMS' },
            { key: 'section_title', value: 'Öne Çıkan Kokular' },
            { key: 'footer_copy', value: 'Copyright © 2026 - Ubrél Parfums' },
            { key: 'wa_number', value: '905551234567' },
            { key: 'ig_link', value: 'https://instagram.com/ubrelparfums' },
            { key: 'tiktok_link', value: 'https://tiktok.com/@ubrelparfums' }
        ];
        settings.forEach(s => db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [s.key, s.value]));

        db.get("SELECT count(*) as count FROM coupons", (err, row) => {
            if(row.count == 0) db.run("INSERT INTO coupons (code, discount_percent) VALUES ('UBREL10', 10)");
        });
    }, 1000);
});

// AUTH
app.post('/api/login', (req, res) => {
    if(req.body.username === 'ubrel' && req.body.password === 'patron2026') res.json({ success: true, token: 'ubrel_secure' });
    else res.status(401).json({ success: false, message: 'Hatalı giriş!' });
});
app.post('/api/register', (req, res) => {
    db.run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [req.body.name, req.body.email, req.body.password], function(err) {
        if(err) return res.status(400).json({success: false, message: 'Bu e-posta zaten kullanımda.'});
        res.json({success: true, user: {id: this.lastID, name:req.body.name, email:req.body.email}});
    });
});
app.post('/api/user-login', (req, res) => {
    db.get("SELECT id, name, email FROM users WHERE email = ? AND password = ?", [req.body.email, req.body.password], (err, row) => {
        if(row) res.json({success: true, user: row}); else res.status(401).json({success: false, message: 'Hatalı e-posta/şifre!'});
    });
});
app.get('/api/users', (req, res) => db.all("SELECT * FROM users ORDER BY id DESC", [], (err, rows) => res.json(rows)));

// AYARLAR & LİSTELER
app.get('/api/settings', (req, res) => db.all("SELECT * FROM settings", [], (err, rows) => res.json(rows)));
app.post('/api/settings', (req, res) => { db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [req.body.key, req.body.value], ()=> res.json({success:true})); });
app.post('/api/upload', upload.single('image'), (req, res) => { if(req.file) res.json({ url: '/uploads/' + req.file.filename }); else res.status(400).json({ error: 'Hata' }); });
app.get('/api/menus', (req, res) => db.all("SELECT * FROM menus", [], (err, rows) => res.json(rows)));
app.post('/api/menus', (req, res) => db.run("INSERT INTO menus (name) VALUES (?)", [req.body.name], function(){res.json({id:this.lastID})}));
app.delete('/api/menus/:id', (req, res) => db.run("DELETE FROM menus WHERE id=?", req.params.id, ()=>res.json({success:true})));
app.get('/api/categories', (req, res) => db.all("SELECT * FROM categories", [], (err, rows) => res.json(rows)));
app.post('/api/categories', (req, res) => db.run("INSERT INTO categories (name) VALUES (?)", [req.body.name], function(){res.json({id:this.lastID})}));
app.delete('/api/categories/:id', (req, res) => db.run("DELETE FROM categories WHERE id=?", req.params.id, ()=>res.json({success:true})));

// ÜRÜNLER 
app.get('/api/products', (req, res) => {
    const query = `SELECT p.*, n.top, n.heart, n.base, n.description FROM products p LEFT JOIN product_notes n ON p.id = n.product_id ORDER BY p.id DESC`;
    db.all(query, [], (err, rows) => res.json(rows));
});
app.post('/api/products', upload.single('image'), (req, res) => { 
    const {name, price, old_price, badge, category, top, heart, base, desc} = req.body; 
    const imagePath = req.file ? '/uploads/' + req.file.filename : req.body.image; 
    db.run("INSERT INTO products (name, price, old_price, badge, image, category) VALUES (?, ?, ?, ?, ?, ?)", [name, price, old_price, badge, imagePath, category], function(err) {
        if(err) return res.status(500).json({error: err.message});
        const pId = this.lastID;
        db.run("INSERT INTO product_notes (product_id, top, heart, base, description) VALUES (?, ?, ?, ?, ?)", [pId, top||'', heart||'', base||'', desc||''], () => res.json({id:pId}));
    }); 
});
app.delete('/api/products/:id', (req, res) => {
    db.run("DELETE FROM products WHERE id=?", req.params.id);
    db.run("DELETE FROM product_notes WHERE product_id=?", req.params.id, () => res.json({success:true}));
});
app.post('/api/products/update', upload.single('image'), (req, res) => {
    const { id, name, price, old_price, badge, category, top, heart, base, desc, existing_image } = req.body;
    const imagePath = req.file ? '/uploads/' + req.file.filename : existing_image;
    db.run("UPDATE products SET name=?, price=?, old_price=?, badge=?, image=?, category=? WHERE id=?", [name, price, old_price, badge, imagePath, category, id], function(err) {
        if(err) return res.status(500).json({error: err.message});
        db.run("UPDATE product_notes SET top=?, heart=?, base=?, description=? WHERE product_id=?", [top||'', heart||'', base||'', desc||'', id], () => res.json({success:true}));
    });
});

// SİPARİŞ & SHOPIER
app.get('/api/orders', (req, res) => db.all("SELECT * FROM orders ORDER BY id DESC", [], (err, rows) => res.json(rows)));
app.get('/api/user-orders/:email', (req, res) => db.all("SELECT * FROM orders WHERE email = ? ORDER BY id DESC", [req.params.email], (err, rows) => res.json(rows)));
app.post('/api/orders', (req, res) => {
    db.run("INSERT INTO orders (customer_name, email, phone, address, total, items, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)", [req.body.customer_name, req.body.email, req.body.phone, req.body.address, req.body.total, JSON.stringify(req.body.items), req.body.payment_method], function(err){ res.json({id: this.lastID}); });
});
app.post('/api/update-order', (req, res) => db.run("UPDATE orders SET status = ? WHERE id = ?", [req.body.status, req.body.id], () => res.json({success: true})));
app.delete('/api/orders/:id', (req, res) => db.run("DELETE FROM orders WHERE id=?", req.params.id, () => res.json({success:true})));
app.post('/api/pay/shopier', async (req, res) => { res.json({ success: true, payment_url: "https://www.shopier.com/tr/" }); });

// KUPON & YORUMLAR
app.post('/api/coupons/verify', (req, res) => {
    db.get("SELECT discount_percent FROM coupons WHERE code = ?", [req.body.code.toUpperCase()], (err, row) => {
        if(row) res.json({success: true, discount: row.discount_percent}); else res.json({success: false, message: 'Kupon geçersiz veya süresi dolmuş.'});
    });
});
app.get('/api/reviews/:product_id', (req, res) => {
    db.all("SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC", [req.params.product_id], (err, rows) => res.json(rows));
});
app.post('/api/reviews', (req, res) => {
    db.run("INSERT INTO reviews (product_id, name, rating, comment) VALUES (?, ?, ?, ?)", [req.body.product_id, req.body.name, req.body.rating, req.body.comment], () => res.json({success:true}));
});

// MESAJ VE BÜLTEN
app.get('/api/messages', (req, res) => db.all("SELECT * FROM messages ORDER BY id DESC", [], (err, rows) => res.json(rows)));
app.post('/api/messages', (req, res) => db.run("INSERT INTO messages (name, email, message) VALUES (?, ?, ?)", [req.body.name, req.body.email, req.body.message], ()=>res.json({success: true})));
app.delete('/api/messages/:id', (req, res) => db.run("DELETE FROM messages WHERE id=?", req.params.id, () => res.json({success:true})));
app.post('/api/newsletter', (req, res) => { db.run("INSERT INTO newsletter (email) VALUES (?)", [req.body.email], function(err) { if(err) return res.status(400).json({success: false}); res.json({success: true}); }); });
app.get('/api/newsletter-list', (req, res) => db.all("SELECT * FROM newsletter ORDER BY id DESC", [], (err, rows) => res.json(rows)));

app.listen(PORT, () => console.log(`Premium Sistem Aktif: http://localhost:${PORT}`));