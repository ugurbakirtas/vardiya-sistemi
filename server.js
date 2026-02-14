const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// 🔒 GÜVENLİK ZIRHI: Bu şifreyi app.js göndermezse kapı açılmaz!
const API_SECRET = "TURKMEDYA_GIZLI_SIFRE_2026";

// 📧 1. MAİL BİLGİLERİN
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'ugurbakirtas@gmail.com', // BURAYI DOLDUR
        pass: 'tzbejsshhqqpigca'         // BURAYI DOLDUR
    }
});

// 🤖 2. TELEGRAM BİLGİLERİN (Artık kimse çalamaz)
const TELEGRAM_API = "8509542541:AAFu-iDK85iELZQmImCWSZRi3_eWzUyyCiM"; // BURAYI DOLDUR
const TELEGRAM_ID = "859235247";     // BURAYI DOLDUR

// --- MAİL GÖNDERME ROTALARI ---
app.post('/send-excel', async (req, res) => {
    // ŞİFRE KONTROLÜ
    if (req.body.secret !== API_SECRET) {
        console.log("🚨 Yetkisiz mail atma denemesi engellendi!");
        return res.status(403).json({ success: false, message: "Yetkisiz Erişim!" });
    }

    try {
        const { fileName, fileData, toEmails } = req.body;
        const mailOptions = {
            from: 'ugurbakirtas@gmail.com', // BURAYI YİNE DOLDUR
            to: toEmails, 
            subject: 'Haftalık Teknik Personel Vardiya Listesi',
            text: 'Merhaba, bu haftanın teknik personel vardiya listesi ektedir. İyi çalışmalar dileriz.',
            attachments: [{ filename: fileName, content: fileData, contentType: 'application/vnd.ms-excel' }]
        };

        await transporter.sendMail(mailOptions);
        console.log("✅ Mail başarıyla gönderildi:", fileName);
        res.status(200).json({ success: true, message: 'Mail gönderildi' });
    } catch (error) {
        console.error("❌ Mail gönderme hatası:", error);
        res.status(500).json({ success: false, message: error.toString() });
    }
});

// --- TELEGRAM GÖNDERME ROTALARI ---
app.post('/send-telegram', async (req, res) => {
    // ŞİFRE KONTROLÜ
    if (req.body.secret !== API_SECRET) {
        return res.status(403).json({ success: false, message: "Yetkisiz Erişim!" });
    }

    try {
        const { text, reply_markup } = req.body;
        
        // Node 18+ ile gelen standart fetch kullanımı
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_ID,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: reply_markup
            })
        });
        
        const data = await response.json();
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("❌ Telegram hatası:", error);
        res.status(500).json({ success: false, message: error.toString() });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Vardiya Postacısı (Güvenli Mod) ${PORT} portunda devrede!`);
});