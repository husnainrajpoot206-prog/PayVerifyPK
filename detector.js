// detector.js — UPGRADED v2.0
// 4-Layer Detection:
// 1. OCR Text Analysis (existing, improved)
// 2. Metadata / EXIF Analysis
// 3. Image Manipulation Detection (Error Level Analysis)
// 4. Visual Layout Verification (UI pattern matching)

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// PLATFORM DEFINITIONS
// ─────────────────────────────────────────────────────────────
const PLATFORMS = {
    jazzcash: {
        name: 'JazzCash',
        keywords: ['jazzcash', 'jazz cash', 'jazz'],
        txIdPattern: /\b[A-Z0-9]{10,20}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,
        statusWords: ['successful', 'success', 'completed', 'payment sent', 'transferred', 'sent'],
        phonePattern: /\b03\d{9}\b|\b\+923\d{9}\b/,
        // Expected UI colors (dominant hex ranges)
        brandColors: { r: [180, 255], g: [0, 60], b: [0, 60] }, // Red dominant
        // Expected layout: logo top, amount center, tx id bottom
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320,
        maxWidth: 1080,
        minHeight: 500,
        maxHeight: 2400,
    },
    easypaisa: {
        name: 'Easypaisa',
        keywords: ['easypaisa', 'easy paisa', 'telenor'],
        txIdPattern: /\b\d{12,18}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,
        statusWords: ['successful', 'success', 'completed', 'transaction complete'],
        phonePattern: /\b03\d{9}\b|\b\+923\d{9}\b/,
        brandColors: { r: [0, 80], g: [130, 220], b: [0, 80] }, // Green dominant
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320,
        maxWidth: 1080,
        minHeight: 500,
        maxHeight: 2400,
    },
    hbl: {
        name: 'HBL',
        keywords: ['hbl', 'habib bank', 'hbl konnect'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'processed', 'completed'],
        phonePattern: null,
        brandColors: { r: [150, 255], g: [0, 50], b: [0, 50] },
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320, maxWidth: 1080, minHeight: 500, maxHeight: 2400,
    },
    ubl: {
        name: 'UBL',
        keywords: ['ubl', 'united bank'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'processed', 'completed'],
        phonePattern: null,
        brandColors: { r: [0, 60], g: [0, 60], b: [150, 255] },
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320, maxWidth: 1080, minHeight: 500, maxHeight: 2400,
    },
    meezan: {
        name: 'Meezan Bank',
        keywords: ['meezan', 'meezan bank'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'processed', 'completed'],
        phonePattern: null,
        brandColors: { r: [0, 60], g: [100, 200], b: [0, 60] },
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320, maxWidth: 1080, minHeight: 500, maxHeight: 2400,
    },
    sadapay: {
        name: 'SadaPay',
        keywords: ['sadapay', 'sada pay'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'completed', 'sent'],
        phonePattern: null,
        brandColors: { r: [200, 255], g: [200, 255], b: [200, 255] },
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320, maxWidth: 1080, minHeight: 500, maxHeight: 2400,
    },
    nayapay: {
        name: 'NayaPay',
        keywords: ['nayapay', 'naya pay'],
        txIdPattern: /\b[A-Z0-9]{8,25}\b/,
        amountPattern: /rs\.?\s*[\d,]+(\.\d{1,2})?|pkr\s*[\d,]+/i,
        datePattern: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        statusWords: ['successful', 'success', 'completed'],
        phonePattern: null,
        brandColors: { r: [100, 200], g: [0, 80], b: [150, 255] },
        layoutZones: ['header_logo', 'center_amount', 'footer_txid'],
        minWidth: 320, maxWidth: 1080, minHeight: 500, maxHeight: 2400,
    },
};

// ─────────────────────────────────────────────────────────────
// LAYER 1: IMAGE PREPROCESSING & OCR
// ─────────────────────────────────────────────────────────────
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
    } catch {
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
        words: result.data.words || [],
    };
}

// ─────────────────────────────────────────────────────────────
// LAYER 2: METADATA / EXIF ANALYSIS
// ─────────────────────────────────────────────────────────────
async function analyzeMetadata(imagePath) {
    const issues = [];
    const warnings = [];
    let score = 0;

    try {
        const metadata = await sharp(imagePath).metadata();

        // Check 1: Screenshot dimensions (must match mobile screen sizes)
        const { width, height } = metadata;
        const commonWidths = [360, 375, 390, 393, 412, 414, 430, 1080];
        const isCommonWidth = commonWidths.some(w => Math.abs(w - width) < 20);

        if (!isCommonWidth) {
            warnings.push(`Unusual image width (${width}px) — real screenshots are typically 360–430px or 1080px`);
            score += 15;
        }

        // Check 2: Aspect ratio (mobile screenshots: ~9:16 to ~9:20)
        const ratio = height / width;
        if (ratio < 1.5 || ratio > 2.8) {
            issues.push(`Suspicious aspect ratio (${ratio.toFixed(2)}) — real mobile screenshots are ~1.8–2.2`);
            score += 20;
        }

        // Check 3: Color space — screenshots are sRGB, not CMYK
        if (metadata.space && !['srgb', 'rgb'].includes(metadata.space.toLowerCase())) {
            issues.push(`Unusual color space: ${metadata.space} — screenshots should be sRGB`);
            score += 15;
        }

        // Check 4: DPI — screenshots have 72–96 DPI typically
        if (metadata.density && (metadata.density < 60 || metadata.density > 600)) {
            warnings.push(`Unusual DPI: ${metadata.density} — may indicate image was printed/scanned then re-uploaded`);
            score += 10;
        }

        // Check 5: Image format — real screenshots are PNG/JPEG
        const ext = path.extname(imagePath).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            warnings.push(`Uncommon format for a screenshot: ${ext}`);
            score += 10;
        }

        // Check 6: File size vs dimensions (detect blank/white areas indicating editing)
        const stats = fs.statSync(imagePath);
        const fileSizeKB = stats.size / 1024;
        const expectedMinKB = (width * height) / 10000; // rough minimum
        if (fileSizeKB < expectedMinKB * 0.3) {
            warnings.push('File size unusually small for image dimensions — may indicate heavy compression or editing');
            score += 15;
        }

        return { issues, warnings, score, meta: { width, height, format: metadata.format, density: metadata.density } };
    } catch (err) {
        return { issues: ['Could not read image metadata'], warnings: [], score: 10, meta: {} };
    }
}

// ─────────────────────────────────────────────────────────────
// LAYER 3: IMAGE MANIPULATION DETECTION (ELA-style)
// ─────────────────────────────────────────────────────────────
async function detectManipulation(imagePath) {
    const issues = [];
    const warnings = [];
    let score = 0;

    try {
        // Step 1: Re-compress at quality 75 and compare pixel differences
        const recompressedPath = imagePath + '_recomp.jpg';

        await sharp(imagePath)
            .jpeg({ quality: 75 })
            .toFile(recompressedPath);

        // Get pixel data of both images
        const original = await sharp(imagePath)
            .resize(400, null) // normalize size for comparison
            .raw()
            .toBuffer({ resolveWithObject: true });

        const recompressed = await sharp(recompressedPath)
            .resize(400, null)
            .raw()
            .toBuffer({ resolveWithObject: true });

        fs.unlink(recompressedPath, () => { });

        const origData = original.data;
        const recompData = recompressed.data;
        const len = Math.min(origData.length, recompData.length);

        // Calculate ELA (Error Level Analysis) — pixel difference distribution
        let totalDiff = 0;
        let highDiffPixels = 0;
        const diffs = [];

        for (let i = 0; i < len; i += 3) {
            const r = Math.abs(origData[i] - recompData[i]);
            const g = Math.abs(origData[i + 1] - recompData[i + 1]);
            const b = Math.abs(origData[i + 2] - recompData[i + 2]);
            const pixelDiff = (r + g + b) / 3;
            totalDiff += pixelDiff;
            diffs.push(pixelDiff);
            if (pixelDiff > 25) highDiffPixels++;
        }

        const totalPixels = len / 3;
        const avgDiff = totalDiff / totalPixels;
        const highDiffRatio = highDiffPixels / totalPixels;

        // Step 2: Analyze diff distribution
        // Natural screenshots: uniform diff distribution
        // Edited images: clusters of high diff (edited areas stand out)
        diffs.sort((a, b) => a - b);
        const p75 = diffs[Math.floor(diffs.length * 0.75)];
        const p99 = diffs[Math.floor(diffs.length * 0.99)];
        const diffSpread = p99 - p75;

        if (diffSpread > 60) {
            issues.push('High ELA variance detected — specific regions show unusual compression artifacts (possible editing)');
            score += 35;
        } else if (diffSpread > 35) {
            warnings.push('Moderate ELA variance — image may have been partially edited');
            score += 20;
        }

        if (highDiffRatio > 0.15) {
            issues.push(`${(highDiffRatio * 100).toFixed(1)}% of pixels show high error levels — strong indicator of image manipulation`);
            score += 30;
        }

        // Step 3: Check for copy-paste patterns (block uniformity)
        // Real screenshots have natural gradient variation
        // Pasted text/numbers on screenshots create uniform rectangular blocks
        const uniformBlocks = detectUniformBlocks(origData, original.info.width, original.info.height);
        if (uniformBlocks > 5) {
            issues.push(`${uniformBlocks} suspiciously uniform rectangular regions detected — possible text overlay or number replacement`);
            score += 25;
        }

        // Step 4: Noise analysis — real screenshots have consistent sensor/rendering noise
        // Edited areas have different noise profiles
        const noiseScore = analyzeNoise(origData);
        if (noiseScore > 0.7) {
            warnings.push('Inconsistent noise pattern across image — different regions may have different sources');
            score += 15;
        }

        return { issues, warnings, score };

    } catch (err) {
        return { issues: [], warnings: ['Manipulation analysis could not be completed'], score: 5 };
    }
}

function detectUniformBlocks(pixelData, width, height) {
    // Sample 10x10 blocks and check for suspicious uniformity
    const blockSize = 10;
    let uniformCount = 0;

    for (let by = 0; by < height - blockSize; by += blockSize) {
        for (let bx = 0; bx < width - blockSize; bx += blockSize) {
            let rSum = 0, gSum = 0, bSum = 0;
            let rSqSum = 0, gSqSum = 0, bSqSum = 0;
            let count = 0;

            for (let dy = 0; dy < blockSize; dy++) {
                for (let dx = 0; dx < blockSize; dx++) {
                    const idx = ((by + dy) * width + (bx + dx)) * 3;
                    if (idx + 2 >= pixelData.length) continue;
                    const r = pixelData[idx], g = pixelData[idx + 1], b = pixelData[idx + 2];
                    rSum += r; gSum += g; bSum += b;
                    rSqSum += r * r; gSqSum += g * g; bSqSum += b * b;
                    count++;
                }
            }

            if (count === 0) continue;
            const rVar = (rSqSum / count) - (rSum / count) ** 2;
            const gVar = (gSqSum / count) - (gSum / count) ** 2;
            const bVar = (bSqSum / count) - (bSum / count) ** 2;
            const avgVar = (rVar + gVar + bVar) / 3;

            // Pure white/color blocks (variance < 2) that are surrounded by non-uniform areas
            if (avgVar < 2 && rSum / count > 200) {
                uniformCount++;
            }
        }
    }

    return uniformCount;
}

function analyzeNoise(pixelData) {
    // Split image into quadrants and compare noise levels
    // Very different noise levels between quadrants = suspicious
    const len = pixelData.length;
    const quarter = Math.floor(len / 4);

    const noises = [];
    for (let q = 0; q < 4; q++) {
        let variance = 0;
        const start = q * quarter;
        const end = Math.min(start + quarter, len);
        let mean = 0;
        let count = 0;
        for (let i = start; i < end; i += 3) {
            mean += pixelData[i];
            count++;
        }
        mean /= count;
        for (let i = start; i < end; i += 3) {
            variance += (pixelData[i] - mean) ** 2;
        }
        noises.push(Math.sqrt(variance / count));
    }

    const maxNoise = Math.max(...noises);
    const minNoise = Math.min(...noises);
    if (minNoise === 0) return 0;
    return (maxNoise - minNoise) / maxNoise; // 0 = uniform, 1 = very different
}

// ─────────────────────────────────────────────────────────────
// LAYER 4: VISUAL LAYOUT VERIFICATION
// ─────────────────────────────────────────────────────────────
async function verifyVisualLayout(imagePath, platformKey, ocrWords) {
    const issues = [];
    const warnings = [];
    let score = 0;
    const p = PLATFORMS[platformKey];

    try {
        const metadata = await sharp(imagePath).metadata();
        const { width, height } = metadata;

        // Check 1: Dimensions match mobile app screenshots
        if (width < p.minWidth || width > p.maxWidth) {
            issues.push(`Image width (${width}px) outside expected range for ${p.name} screenshots (${p.minWidth}–${p.maxWidth}px)`);
            score += 20;
        }
        if (height < p.minHeight || height > p.maxHeight) {
            warnings.push(`Image height (${height}px) unusual for ${p.name} app screenshot`);
            score += 10;
        }

        // Check 2: Brand color presence in image
        const colorScore = await checkBrandColors(imagePath, p.brandColors);
        if (colorScore < 0.01) {
            issues.push(`${p.name} brand colors not detected in image — UI may be fake or heavily edited`);
            score += 25;
        }

        // Check 3: OCR word positions (layout verification)
        // Amount should be in center-vertical region
        // Transaction ID should be in lower half
        if (ocrWords && ocrWords.length > 0) {
            const amountWords = ocrWords.filter(w =>
                /rs|pkr|amount|\d{3,}/i.test(w.text) && w.confidence > 60
            );
            const txWords = ocrWords.filter(w =>
                /tx|transaction|ref|id/i.test(w.text) && w.confidence > 60
            );

            // Amount should be in middle 40% of image
            for (const aw of amountWords) {
                const relY = aw.bbox ? aw.bbox.y0 / height : 0.5;
                if (relY < 0.2 || relY > 0.85) {
                    warnings.push('Amount text found in unusual position — may indicate layout manipulation');
                    score += 15;
                    break;
                }
            }

            // Check for overlapping text (copy-pasted text)
            const overlaps = detectTextOverlap(ocrWords);
            if (overlaps > 0) {
                issues.push(`${overlaps} overlapping text region(s) detected — possible number replacement over original`);
                score += 30;
            }
        }

        // Check 4: Check for screenshot status bar (real screenshots have it)
        const hasStatusBar = await checkStatusBar(imagePath, width);
        if (!hasStatusBar) {
            warnings.push('No mobile status bar detected at top — screenshot may be cropped or fake');
            score += 10;
        }

        // Check 5: Font consistency check
        const fontConsistency = await checkFontConsistency(imagePath, width, height);
        if (!fontConsistency) {
            warnings.push('Inconsistent text rendering detected — different fonts in same screenshot suggest editing');
            score += 15;
        }

        return { issues, warnings, score };
    } catch {
        return { issues: [], warnings: ['Visual layout analysis could not be completed'], score: 0 };
    }
}

async function checkBrandColors(imagePath, expectedColors) {
    try {
        const { data, info } = await sharp(imagePath)
            .resize(100, 100)
            .raw()
            .toBuffer({ resolveWithObject: true });

        let matchCount = 0;
        const totalPixels = info.width * info.height;

        for (let i = 0; i < data.length; i += 3) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const rMatch = r >= expectedColors.r[0] && r <= expectedColors.r[1];
            const gMatch = g >= expectedColors.g[0] && g <= expectedColors.g[1];
            const bMatch = b >= expectedColors.b[0] && b <= expectedColors.b[1];
            if (rMatch && gMatch && bMatch) matchCount++;
        }

        return matchCount / totalPixels;
    } catch {
        return 0.5; // neutral if can't check
    }
}

function detectTextOverlap(words) {
    let overlaps = 0;
    for (let i = 0; i < words.length; i++) {
        for (let j = i + 1; j < words.length; j++) {
            const a = words[i].bbox, b = words[j].bbox;
            if (!a || !b) continue;
            // Check if bounding boxes overlap significantly
            const xOverlap = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
            const yOverlap = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
            const aArea = (a.x1 - a.x0) * (a.y1 - a.y0);
            if (aArea > 0 && (xOverlap * yOverlap) / aArea > 0.5) overlaps++;
        }
    }
    return overlaps;
}

async function checkStatusBar(imagePath, width) {
    try {
        // Real screenshots: top ~24px has time/battery/signal (dark or light pixels in specific pattern)
        const topStrip = await sharp(imagePath)
            .extract({ left: 0, top: 0, width, height: 30 })
            .resize(100, 10)
            .grayscale()
            .raw()
            .toBuffer();

        // Check for variation in top strip (status bar has icons = variation)
        let variance = 0;
        let mean = 0;
        for (const p of topStrip) mean += p;
        mean /= topStrip.length;
        for (const p of topStrip) variance += (p - mean) ** 2;
        variance /= topStrip.length;

        // Status bar should have some variation (icons, time text)
        return variance > 100;
    } catch {
        return true; // don't penalize if check fails
    }
}

async function checkFontConsistency(imagePath, width, height) {
    try {
        // Sample text regions from top and bottom thirds
        // Compare contrast/sharpness — consistent font rendering = similar values
        const topThird = await sharp(imagePath)
            .extract({ left: 0, top: Math.floor(height * 0.1), width, height: Math.floor(height * 0.25) })
            .grayscale()
            .raw()
            .toBuffer();

        const bottomThird = await sharp(imagePath)
            .extract({ left: 0, top: Math.floor(height * 0.65), width, height: Math.floor(height * 0.25) })
            .grayscale()
            .raw()
            .toBuffer();

        const topContrast = calcContrast(topThird);
        const bottomContrast = calcContrast(bottomThird);

        // If contrast difference is extreme, fonts may be from different sources
        const diff = Math.abs(topContrast - bottomContrast);
        return diff < 60; // allow some natural variation
    } catch {
        return true;
    }
}

function calcContrast(buffer) {
    let min = 255, max = 0;
    for (const p of buffer) {
        if (p < min) min = p;
        if (p > max) max = p;
    }
    return max - min;
}

// ─────────────────────────────────────────────────────────────
// LAYER 1 (enhanced): OCR TEXT ANALYSIS
// ─────────────────────────────────────────────────────────────
function detectPlatform(text, hint) {
    if (hint && PLATFORMS[hint]) return hint;
    for (const [key, p] of Object.entries(PLATFORMS)) {
        for (const kw of p.keywords) {
            if (text.includes(kw)) return key;
        }
    }
    return null;
}

function analyzeText(text, platformKey, ocrConfidence) {
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

    // Enhanced red flag detection
    const redFlags = ['sample', 'demo', 'test', 'fake', 'edited', 'template', 'example', 'photoshop', 'canva', 'screenshot'];
    const found = redFlags.filter(w => text.includes(w));
    if (found.length > 0) { issues.push(`Suspicious keywords found: "${found.join('", "')}"`); score += 50; }

    // Check for copy-paste artifacts in OCR (same text repeated)
    const words = text.split(/\s+/).filter(w => w.length > 4);
    const wordFreq = {};
    words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
    const repeated = Object.entries(wordFreq).filter(([, c]) => c > 3).map(([w]) => w);
    if (repeated.length > 2) {
        warnings.push('Unusual text repetition detected — possible copy-paste manipulation');
        score += 15;
    }

    if (ocrConfidence < 40) { warnings.push('Poor image quality — result may be unreliable'); score += 10; }

    const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
    if (wordCount < 8) { warnings.push('Very little text detected — screenshot may be cropped or blurry'); score += 15; }

    if (/(.)\1{7,}/.test(text)) { warnings.push('Unusual character repetition — possible image manipulation'); score += 10; }

    return { issues, warnings, score: Math.min(score, 100) };
}

// ─────────────────────────────────────────────────────────────
// COMBINED SCORING
// ─────────────────────────────────────────────────────────────
function combineScores(textScore, metaScore, manipScore, layoutScore) {
    // Weighted combination:
    // Text analysis: 25%
    // Metadata: 20%
    // Manipulation detection: 35% (most important)
    // Visual layout: 20%
    const combined =
        (textScore.score * 0.25) +
        (metaScore.score * 0.20) +
        (manipScore.score * 0.35) +
        (layoutScore.score * 0.20);

    return Math.min(Math.round(combined), 100);
}

function riskLevel(score) {
    if (score <= 15) return 'LOW';
    if (score <= 45) return 'MEDIUM';
    return 'HIGH';
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
const DISCLAIMER = 'Advisory tool only. Always verify through official JazzCash/Easypaisa apps or bank portals. PayCheckPK is not liable for any financial decisions made based on this analysis.';

async function analyzePaymentScreenshot(imagePath, platformHint) {
    // Run all 4 layers
    const [ocrResult, metaResult] = await Promise.all([
        extractText(imagePath),
        analyzeMetadata(imagePath),
    ]);

    const { text, confidence, words } = ocrResult;
    const platformKey = detectPlatform(text, platformHint);

    if (!platformKey) {
        return {
            platform: 'Unknown',
            risk: 'HIGH',
            score: 65,
            issues: ['Could not identify payment platform', 'JazzCash, Easypaisa or bank branding not found'],
            warnings: ['Try selecting the platform manually, or upload a clearer screenshot'],
            ocrConfidence: Math.round(confidence),
            layers: { text: 65, metadata: metaResult.score, manipulation: 0, layout: 0 },
            disclaimer: DISCLAIMER,
        };
    }

    // Run remaining layers in parallel
    const [textResult, manipResult, layoutResult] = await Promise.all([
        Promise.resolve(analyzeText(text, platformKey, confidence)),
        detectManipulation(imagePath),
        verifyVisualLayout(imagePath, platformKey, words),
    ]);

    const finalScore = combineScores(textResult, metaResult, manipResult, layoutResult);

    // Merge all issues and warnings
    const allIssues = [
        ...textResult.issues,
        ...metaResult.issues,
        ...manipResult.issues,
        ...layoutResult.issues,
    ];

    const allWarnings = [
        ...textResult.warnings,
        ...metaResult.warnings,
        ...manipResult.warnings,
        ...layoutResult.warnings,
    ];

    return {
        platform: PLATFORMS[platformKey].name,
        risk: riskLevel(finalScore),
        score: finalScore,
        issues: allIssues,
        warnings: allWarnings,
        ocrConfidence: Math.round(confidence),
        // Layer-by-layer breakdown for transparency
        layers: {
            text: Math.min(textResult.score, 100),
            metadata: Math.min(metaResult.score, 100),
            manipulation: Math.min(manipResult.score, 100),
            layout: Math.min(layoutResult.score, 100),
        },
        meta: metaResult.meta,
        disclaimer: DISCLAIMER,
    };
}

module.exports = { analyzePaymentScreenshot };

