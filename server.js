require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const admin = require('firebase-admin');

const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand 
} = require("@aws-sdk/client-s3");

const { 
  getSignedUrl 
} = require("@aws-sdk/s3-request-presigner");

// ==========================================
// 🔐 FIREBASE INIT
// ==========================================

let serviceAccount;

try {
  if (!process.env.FIREBASE_KEY) {
    throw new Error("FIREBASE_KEY not found");
  }

  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

  // 🔥 FIX PRIVATE KEY
  serviceAccount.private_key =
    serviceAccount.private_key.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log("✅ Firebase initialized successfully");

} catch (err) {
  console.error("❌ Firebase Init Error:", err);
}

const db = admin.firestore();

// ==========================================
// 🚀 EXPRESS APP
// ==========================================

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ==========================================
// ☁️ BACKBLAZE B2 CONFIG
// ==========================================

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: "us-east-005",
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  }
});

// ==========================================
// 📦 MULTER MEMORY STORAGE
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ==========================================
// 📤 FILE UPLOAD ROUTE
// ==========================================

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    const cleanName = req.file.originalname.replace(/\s+/g, '_');

    const fileName =
      `${Date.now()}-${cleanName}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    });

    await s3.send(uploadCommand);

    // 🔥 TEMP SIGNED URL
    const getCommand = new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: fileName
    });

    const signedUrl = await getSignedUrl(
      s3,
      getCommand,
      {
        expiresIn: 60 * 60 * 24 * 7 // 7 days
      }
    );

    res.json({
      success: true,
      url: signedUrl
    });

  } catch (err) {

    console.error("❌ B2 Upload Error:", err);

    res.status(500).json({
      error: 'Upload failed'
    });
  }
});

// ==========================================
// 📲 SESSION REGISTER
// ==========================================

app.post('/api/session/register', async (req, res) => {

  try {

    const {
      uid,
      deviceName,
      location,
      sessionId
    } = req.body;

    if (!uid || !sessionId) {
      return res.status(400).json({
        error: "Missing uid or sessionId"
      });
    }

    await db
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .doc(sessionId)
      .set({
        deviceName,
        location,
        sessionId,
        loginAt:
          admin.firestore.FieldValue.serverTimestamp()
      });

    res.json({
      success: true
    });

  } catch (err) {

    console.error("❌ Session Register Error:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ==========================================
// 🚪 SESSION LOGOUT
// ==========================================

app.post('/api/session/logout', async (req, res) => {

  try {

    const {
      uid,
      sessionId
    } = req.body;

    if (!uid || !sessionId) {
      return res.status(400).json({
        error: "Missing uid or sessionId"
      });
    }

    await db
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .doc(sessionId)
      .delete();

    res.json({
      success: true
    });

  } catch (err) {

    console.error("❌ Logout Error:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ==========================================
// 🏠 HEALTH CHECK
// ==========================================

app.get('/', (req, res) => {
  res.send('Nullforge Backend is Live 🚀');
});

// ==========================================
// 🚀 START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
