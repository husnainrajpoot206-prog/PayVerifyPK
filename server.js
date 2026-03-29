const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { analyzePaymentScreenshot } = require('./detector');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files allowed'));
    },
});

const FREE_DAILY_LIMIT = 10;
const requestLog = {};

setInterval(() => {
    const today = new Date().toDateString();
    for (const key of Object.keys(requestLog)) {
        if (!key.endsWith(today)) delete requestLog[key];
    }
}, 60 * 60 * 1000);

function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const today = new Date().toDateString();
    const key = `${ip}_${today}`;
    requestLog[key] = (requestLog[key] || 0) + 1;
    const used = requestLog[key];
    const remaining = Math.max(0, FREE_DAILY_LIMIT - used);
    res.setHeader('X-Checks-Used', used);
    res.setHeader('X-Checks-Remaining', remaining);
    if (used > FREE_DAILY_LIMIT) {
        return res.status(429).json({
            error: 'daily_limit_reached',
            message: `Free limit is ${FREE_DAILY_LIMIT} checks/day. Upgrade to Pro for unlimited checks.`,
            upgradeUrl: '/pricing.html',
        });
    }
    next();
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/check', rateLimitMiddleware, upload.single('screenshot'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const filePath = req.file.path;
    try {
        const platform = req.body.platform || null;
        const result = await analyzePaymentScreenshot(filePath, platform);
        fs.unlink(filePath, () => { });
        return res.json({
            ...result,
            checksRemaining: parseInt(res.getHeader('X-Checks-Remaining')),
        });
    } catch (err) {
        fs.unlink(filePath, () => { });
        console.error('[error]', err.message);
        return res.status(500).json({ error: 'analysis_failed', message: 'Could not analyze image. Try a clearer screenshot.' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ PayCheckPK running on http://localhost:${PORT}`);
});