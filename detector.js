const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');

const PLATFORMS = {
    jazzcash: {
        name: 'JazzCash',
        keywords: ['jazzcash', 'jazz cash', 'jazz'],
        txIdPattern: /\b[A-Z0-9]{10,20}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,
        statusWords: ['successful', 'success', 'completed', 'payment sent', 'transferred', 'sent'],
        phonePattern: /\b03\d{9}\b|\b\+923\d{9}\b/,
    },
    easypaisa: {
        name: 'Easypaisa',
        keywords: ['easypaisa', 'easy paisa', 'telenor'],
        txIdPattern: /\b\d{12,18}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,
        statusWords: ['successful', 'success', 'completed', 'transaction complete'],
        phonePattern: /\b03\d{9}\b|\b\+923\d{9}\b/,
    },
    hbl: {
        name: 'HBL',
        keywords: ['hbl', 'habib bank', 'hbl konnect'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'processed', 'completed'],
        phonePattern: null,
    },
    ubl: {
        name: 'UBL',
        keywords: ['ubl', 'united bank'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'processed', 'completed'],
        phonePattern: null,
    },
    meezan: {
        name: 'Meezan Bank',
        keywords: ['meezan', 'meezan bank'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'processed', 'completed'],
        phonePattern: null,
    },
    sadapay: {
        name: 'SadaPay',
        keywords: ['sadapay', 'sada pay'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'completed', 'sent'],
        phonePattern: null,
    },
    nayapay: {
        name: 'NayaPay',
        keywords: ['nayapay', 'naya pay'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'completed'],
        phonePattern: null,
    },
};

async function preprocessImage(imagePath) {
    const outputPath = imagePath + '_proc.png';
    try {
        const metadata = await sharp(imagePath).metadata();
        let pipeline = sharp(imagePath);
        if (metadata.width && metadata.width < 800) {
            pipeline = pipeline.resize(Math.min(metadata.width * 2, 1600), null, { kernel: sharp.kernel.lanczos3 });
        } else if (metadata.width && metadata.width > 2000) {
            pipeline = pipeline.resize(1600, null);
        }
        await pipeline.grayscale().normalize().sharpen({ sigma: 1.5 }).png().toFile(outputPath);
        return outputPath;
    } catch (err) {
        return imagePath;
    }
}

async function extractText(imagePath) {
    const processedPath = await preprocessImage(imagePath);
    let result;
    try {
        result = await Tesseract.recognize(processedPath, 'eng', { logger: () => { } });
    } finally {
        if (processedPath !== imagePath) fs.unlink(processedPath, () => { });
    }
    return {
        text: (result.data.text || '').toLowerCase(),
        rawText: result.data.text || '',
        confidence: result.data.confidence || 0,
    };
}

function detectPlatform(text, hint) {
    if (hint && PLATFORMS[hint]) return hint;
    for (const [key, p] of Object.entries(PLATFORMS)) {
        for (const kw of p.keywords) {
            if (text.includes(kw)) return key;
        }
    }
    return null;
}

function analyze(text, platformKey, ocrConfidence) {
    const p = PLATFORMS[platformKey];
    const issues = [];
    const warnings = [];
    let score = 0;

    const hasBrand = p.keywords.some(kw => text.includes(kw));
    if (!hasBrand) { issues.push(`No ${p.name} branding found`); score += 30; }

    const amountMatch = p.amountPattern.exec(text);
    if (!amountMatch) { issues.push('No valid amount found (Rs/PKR format missing)'); score += 25; }
    else {
        const amtStr = amountMatch[0].replace(/[^0-9]/g, '');
        if (parseInt(amtStr) === 0) { issues.push('Amount is zero — suspicious'); score += 20; }
    }

    if (!p.txIdPattern.test(text.toUpperCase())) { issues.push('Transaction ID missing or invalid'); score += 25; }

    const hasDate = p.datePattern.test(text);
    if (!hasDate) { issues.push('No valid date found'); score += 15; }
    else {
        const dm = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/);
        if (dm && parseInt(dm[1]) > new Date().getFullYear()) {
            issues.push(`Date is in the future (${dm[1]}) — highly suspicious`); score += 35;
        }
    }

    const hasStatus = p.statusWords.some(kw => text.includes(kw));
    if (!hasStatus) { warnings.push('No success/completion status found'); score += 10; }

    if (p.phonePattern && !p.phonePattern.test(text)) {
        warnings.push('No Pakistani mobile number (03xx) found'); score += 10;
    }

    const redFlags = ['sample', 'demo', 'test', 'fake', 'edited', 'template', 'example'];
    const found = redFlags.filter(w => text.includes(w));
    if (found.length > 0) { issues.push(`Suspicious keywords found: "${found.join('", "')}"`); score += 50; }

    if (ocrConfidence < 40) { warnings.push('Poor image quality — result may be unreliable'); score += 10; }

    const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
    if (wordCount < 8) { warnings.push('Very little text detected — screenshot may be cropped or blurry'); score += 15; }

    if (/(.)\1{7,}/.test(text)) { warnings.push('Unusual character repetition — possible image manipulation'); score += 10; }

    return { issues, warnings, score: Math.min(score, 100) };
}

function riskLevel(score) {
    if (score <= 15) return 'LOW';
    if (score <= 45) return 'MEDIUM';
    return 'HIGH';
}

const DISCLAIMER = 'Advisory tool only. Always verify through official JazzCash/Easypaisa apps or bank portals. PayCheckPK is not liable for any financial decisions made based on this analysis.';

async function analyzePaymentScreenshot(imagePath, platformHint) {
    const { text, confidence } = await extractText(imagePath);
    const platformKey = detectPlatform(text, platformHint);

    if (!platformKey) {
        return {
            platform: 'Unknown',
            risk: 'HIGH',
            score: 65,
            issues: ['Could not identify payment platform', 'JazzCash, Easypaisa or bank branding not found'],
            warnings: ['Try selecting the platform manually, or upload a clearer screenshot'],
            ocrConfidence: Math.round(confidence),
            disclaimer: DISCLAIMER,
        };
    }

    const { issues, warnings, score } = analyze(text, platformKey, confidence);
    return {
        platform: PLATFORMS[platformKey].name,
        risk: riskLevel(score),
        score,
        issues,
        warnings,
        ocrConfidence: Math.round(confidence),
        disclaimer: DISCLAIMER,
    };
}

module.exports = { analyzePaymentScreenshot };