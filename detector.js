const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');

const PLATFORMS = {
    jazzcash: {
        name: 'JazzCash',
        keywords: ['jazzcash', 'jazz cash', 'jazz'],
        txIdPattern: /\b[A-Z0-9]{10,20}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}|on\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}/i,
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

function parseAmountFromMatch(amountMatch) {
    if (!amountMatch) return null;
    const normalized = amountMatch[0].replace(/[, ]/g, '');
    const value = Number(normalized.replace(/[^0-9.]/g, ''));
    return Number.isFinite(value) ? value : null;
}

function buildSignal(name, passed, points, reason) {
    return { name, passed, points, reason };
}

function analyze(text, platformKey, ocrConfidence) {
    const p = PLATFORMS[platformKey];
    const issues = [];
    const warnings = [];
    const signalBreakdown = [];
    let score = 0;
    let hasAmount = false;
    let hasTxId = false;
    let hasStatus = false;

    const hasBrand = p.keywords.some(kw => text.includes(kw));
    if (!hasBrand) {
        issues.push(`No ${p.name} branding found`);
        score += 30;
        signalBreakdown.push(buildSignal('brand_match', false, 30, `${p.name} branding keywords missing`));
    } else {
        signalBreakdown.push(buildSignal('brand_match', true, 0, `${p.name} branding found in OCR`));
    }

    const amountMatch = p.amountPattern.exec(text);
    if (!amountMatch) {
        issues.push('No valid amount found (Rs/PKR format missing)');
        score += 25;
        signalBreakdown.push(buildSignal('amount_format', false, 25, 'Amount format missing or unreadable'));
    } else {
        hasAmount = true;
        const amountValue = parseAmountFromMatch(amountMatch);
        signalBreakdown.push(buildSignal('amount_format', true, 0, `Amount string detected: ${amountMatch[0].trim()}`));
        if (amountValue === 0) {
            issues.push('Amount is zero — suspicious');
            score += 20;
            signalBreakdown.push(buildSignal('amount_zero', false, 20, 'Detected amount equals zero'));
        }
        if (amountValue !== null && amountValue > 5000000) {
            warnings.push('Very high amount detected — verify directly in official app');
            score += 12;
            signalBreakdown.push(buildSignal('amount_outlier', false, 12, `Amount appears unusually high (${amountValue})`));
        }
    }

    hasTxId = p.txIdPattern.test(text.toUpperCase());
    if (!hasTxId) {
        issues.push('Transaction ID missing or invalid');
        score += 25;
        signalBreakdown.push(buildSignal('txid_format', false, 25, 'Transaction ID did not match platform pattern'));
    } else {
        signalBreakdown.push(buildSignal('txid_format', true, 0, 'Transaction ID pattern matched'));
    }

    hasStatus = p.statusWords.some(kw => text.includes(kw));
    const hasCoreTrustedSignals = hasBrand && hasAmount && hasTxId && hasStatus;

    const hasDate = p.datePattern.test(text);
    if (!hasDate) {
        warnings.push('No valid date found');
        const datePenalty = hasCoreTrustedSignals ? 0 : 8;
        if (!hasCoreTrustedSignals) score += datePenalty;
        signalBreakdown.push(buildSignal('date_presence', false, datePenalty, hasCoreTrustedSignals ? 'Date not detected, but core trust signals are strong' : 'Date format not detected'));
    } else {
        signalBreakdown.push(buildSignal('date_presence', true, 0, 'Date pattern detected'));
        const dm = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/);
        const monthDate = text.match(/on\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+(\d{4})\s+at\s+\d{1,2}:\d{2}/i);
        const detectedYear = dm ? parseInt(dm[1], 10) : (monthDate ? parseInt(monthDate[1], 10) : null);
        if (detectedYear && detectedYear > new Date().getFullYear()) {
            issues.push(`Date is in the future (${detectedYear}) — highly suspicious`);
            score += 35;
            signalBreakdown.push(buildSignal('future_date', false, 35, `Detected future year ${detectedYear}`));
        }
    }

    if (!hasStatus) {
        warnings.push('No success/completion status found');
        score += 10;
        signalBreakdown.push(buildSignal('status_words', false, 10, 'No success status keywords detected'));
    } else {
        signalBreakdown.push(buildSignal('status_words', true, 0, 'Success/completion wording found'));
    }

    if (p.phonePattern && !p.phonePattern.test(text)) {
        warnings.push('No Pakistani mobile number (03xx) found');
        score += 10;
        signalBreakdown.push(buildSignal('phone_presence', false, 10, 'Expected Pakistani mobile number missing'));
    } else if (p.phonePattern) {
        signalBreakdown.push(buildSignal('phone_presence', true, 0, 'Pakistani mobile pattern detected'));
    }

    const redFlags = ['sample', 'demo', 'test', 'fake', 'edited', 'template', 'example'];
    const found = redFlags.filter(w => text.includes(w));
    let strongSuspiciousCount = 0;
    if (found.length > 0) {
        issues.push(`Suspicious keywords found: "${found.join('", "')}"`);
        score += 50;
        signalBreakdown.push(buildSignal('tamper_keywords', false, 50, `Tamper terms found: ${found.join(', ')}`));
        strongSuspiciousCount += 1;
    }

    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const duplicateLineCount = lines.length - new Set(lines).size;
    if (duplicateLineCount >= 3) {
        warnings.push('Repeated text blocks detected — possible duplicated overlay/editing');
        score += 15;
        signalBreakdown.push(buildSignal('duplicate_text_blocks', false, 15, `Repeated OCR lines: ${duplicateLineCount}`));
        strongSuspiciousCount += 1;
    }

    const repeatedCharBursts = text.match(/(.)\1{7,}/g) || [];
    if (repeatedCharBursts.length > 0) {
        warnings.push('Unusual character repetition — possible image manipulation');
        score += 12;
        signalBreakdown.push(buildSignal('repeated_characters', false, 12, `Detected ${repeatedCharBursts.length} repeated character sequences`));
        strongSuspiciousCount += 1;
    }

    if (ocrConfidence < 35) {
        warnings.push('Poor image quality — result may be unreliable');
        score += 15;
        signalBreakdown.push(buildSignal('ocr_quality', false, 15, `OCR confidence is low (${Math.round(ocrConfidence)}%)`));
        strongSuspiciousCount += 1;
    } else if (ocrConfidence < 55) {
        warnings.push('Moderate image quality — verify risky signals carefully');
        const moderatePenalty = hasCoreTrustedSignals ? 3 : 8;
        score += moderatePenalty;
        signalBreakdown.push(buildSignal('ocr_quality', false, moderatePenalty, `OCR confidence is moderate (${Math.round(ocrConfidence)}%)`));
    } else {
        signalBreakdown.push(buildSignal('ocr_quality', true, 0, `OCR confidence acceptable (${Math.round(ocrConfidence)}%)`));
    }

    const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
    if (wordCount < 8) {
        warnings.push('Very little text detected — screenshot may be cropped or blurry');
        score += 15;
        signalBreakdown.push(buildSignal('text_density', false, 15, `Only ${wordCount} meaningful words detected`));
        strongSuspiciousCount += 1;
    }

    const hasCurrencyLabel = /\b(rs|pkr)\b/i.test(text);
    const digitCount = (text.match(/\d/g) || []).length;
    if (digitCount > 24 && !hasCurrencyLabel) {
        warnings.push('Numbers are present but currency labels are missing');
        score += 10;
        signalBreakdown.push(buildSignal('currency_context', false, 10, 'High numeric content without currency tags'));
        strongSuspiciousCount += 1;
    }

    if (hasCoreTrustedSignals && strongSuspiciousCount === 0) {
        score = Math.min(score, 10);
        signalBreakdown.push(buildSignal('core_trust_override', true, 0, 'Core trusted signals present and no strong suspicious evidence'));
    }

    return { issues, warnings, score: Math.min(score, 100), signalBreakdown };
}

function riskLevel(score) {
    if (score <= 22) return 'LOW';
    if (score <= 52) return 'MEDIUM';
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

    const { issues, warnings, score, signalBreakdown } = analyze(text, platformKey, confidence);
    return {
        platform: PLATFORMS[platformKey].name,
        risk: riskLevel(score),
        score,
        issues,
        warnings,
        signalBreakdown,
        ocrConfidence: Math.round(confidence),
        disclaimer: DISCLAIMER,
    };
}

module.exports = { analyzePaymentScreenshot };