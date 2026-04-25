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

function getIp(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
}

function normalizeSmsText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m && m[1]) return m[1].trim();
    }
    return null;
}

function sanitizeSenderName(senderName, platform) {
    if (!senderName) return senderName;
    if (platform !== 'easypaisa') return senderName.trim();
    return senderName.replace(/\s+PK$/i, '').trim();
}

function parseSmsByPlatform(platform, smsText) {
    const text = normalizeSmsText(smsText);
    const lower = text.toLowerCase();

    if (!['easypaisa', 'jazzcash'].includes(platform)) {
        return { error: 'Unsupported platform. Use easypaisa or jazzcash.' };
    }

    const platformKeywords = {
        easypaisa: ['easypaisa', 'easy paisa', 'telenor'],
        jazzcash: ['jazzcash', 'jazz cash', 'mobilink microfinance', 'jazz'],
    };

    const amount = firstMatch(text, [
        /(?:rs\.?|pkr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
        /amount\s*(?:is|:)?\s*(?:rs\.?|pkr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    ]);

    const transactionId = firstMatch(text, [
        /(?:trx(?:id)?|tx(?:n|id)?|transaction(?:\s*id)?|ref(?:erence)?(?:\s*id)?)\s*[:#-]?\s*([A-Z0-9\-]{6,})/i,
        /\b([A-Z0-9]{10,24})\b/,
    ]);

    const senderNameRaw = firstMatch(text, [
        /(?:from|sender|received from|sent by)\s*[:\-]?\s*([A-Za-z][A-Za-z .]{2,40})/i,
        /(?:a\/c|account)\s*(?:title|name)?\s*[:\-]?\s*([A-Za-z][A-Za-z .]{2,40})/i,
    ]);
    const senderName = sanitizeSenderName(senderNameRaw, platform);

    const hasPlatformKeyword = platformKeywords[platform].some((keyword) => lower.includes(keyword));
    const missingFields = [];
    if (!hasPlatformKeyword) missingFields.push('platform keyword mismatch');
    if (!amount) missingFields.push('amount');
    if (!senderName) missingFields.push('senderName');
    if (!transactionId) missingFields.push('transactionId');

    return {
        platform,
        extracted: { amount, senderName, transactionId },
        hasPlatformKeyword,
        missingFields,
        status: missingFields.length === 0 ? 'CONFIRMED' : 'UNRECOGNIZED',
    };
}

function rateLimitMiddleware(req, res, next) {
    const ip = getIp(req);
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

app.post('/api/sms/verify', (req, res) => {
    const platform = String(req.body.platform || '').toLowerCase().trim();
    const smsText = req.body.smsText;
    if (!smsText || typeof smsText !== 'string' || smsText.trim().length < 8) {
        return res.status(400).json({ error: 'invalid_sms_text', message: 'Please paste valid SMS text.' });
    }

    const parsed = parseSmsByPlatform(platform, smsText);
    if (parsed.error) return res.status(400).json({ error: 'invalid_platform', message: parsed.error });
    return res.json(parsed);
});

app.listen(PORT, () => {
    console.log(`✅ PayVerifyPK running on http://localhost:${PORT}`);
});