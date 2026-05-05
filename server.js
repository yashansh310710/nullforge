require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

// 🔐 Firebase Init
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();

// ✅ CORS (keep open for now, restrict later)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ✅ Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ✅ Static serving
app.use('/uploads', express.static(uploadDir));

// 📦 Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// 📤 Upload route
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // 🔥 IMPORTANT: use real domain instead of localhost
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT}`;
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({ success: true, url: fileUrl });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 📲 Session Register
app.post('/api/session/register', async (req, res) => {
  try {
    const { uid, deviceName, location, sessionId } = req.body;

    await db.collection('users').doc(uid).collection('sessions').doc(sessionId).set({
      deviceName,
      location,
      loginAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionId
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Session Register Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🚪 Logout
app.post('/api/session/logout', async (req, res) => {
  try {
    const { uid, sessionId } = req.body;

    await db.collection('users').doc(uid).collection('sessions').doc(sessionId).delete();

    res.json({ success: true });
  } catch (err) {
    console.error("Logout Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🏠 Health check
app.get('/', (req, res) => {
  res.send('Nullforge Backend is Live 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});