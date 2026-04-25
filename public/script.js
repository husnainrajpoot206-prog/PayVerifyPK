const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const previewWrap = document.getElementById('previewWrap');
const previewImg = document.getElementById('previewImg');
const clearBtn = document.getElementById('clearBtn');
const platformSelect = document.getElementById('platformSelect');
const checkBtn = document.getElementById('checkBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const checksRemaining = document.getElementById('checksRemaining');
const checksDoneToday = document.getElementById('checksDoneToday');
const resultSection = document.getElementById('resultSection');
const resultCard = document.getElementById('resultCard');
const screenshotTabBtn = document.getElementById('screenshotTabBtn');
const smsTabBtn = document.getElementById('smsTabBtn');
const heroScreenshotBtn = document.getElementById('heroScreenshotBtn');
const heroSmsBtn = document.getElementById('heroSmsBtn');
const screenshotPane = document.getElementById('screenshotPane');
const smsPane = document.getElementById('smsPane');
const stepper = document.getElementById('stepper');
const smsTextInput = document.getElementById('smsTextInput');
const verifySmsBtn = document.getElementById('verifySmsBtn');
const smsStatus = document.getElementById('smsStatus');
const smsResult = document.getElementById('smsResult');
const smsDetectedPlatform = document.getElementById('smsDetectedPlatform');

const API_BASE = window.location.origin;
const CHECKS_COUNTER_KEY = 'payverify_checks_today_local';
let selectedFile = null;
let detectedSmsPlatform = null;

const existingCount = Number(localStorage.getItem(CHECKS_COUNTER_KEY) || 0);
checksDoneToday.textContent = String(existingCount);

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('drag-over'); });
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
});
uploadArea.addEventListener('click', (e) => {
    if (e.target.closest('label') || e.target === fileInput) return;
    fileInput.click();
});
fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});
clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFile();
});
screenshotTabBtn.addEventListener('click', () => setActiveMode('screenshot'));
smsTabBtn.addEventListener('click', () => setActiveMode('sms'));
heroScreenshotBtn.addEventListener('click', () => {
    setActiveMode('screenshot');
    document.getElementById('verify').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
heroSmsBtn.addEventListener('click', () => {
    setActiveMode('sms');
    document.getElementById('verify').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
smsTextInput.addEventListener('input', handleSmsTextChanged);
smsTextInput.addEventListener('paste', () => setTimeout(handleSmsTextChanged, 0));

function handleFileSelect(file) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) return showError('Please upload JPG, PNG, or WEBP image');
    if (file.size > 8 * 1024 * 1024) return showError('File too large. Max 8MB.');
    selectedFile = file;
    fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        uploadArea.hidden = true;
        previewWrap.hidden = false;
    };
    reader.readAsDataURL(file);
    checkBtn.disabled = false;
    btnText.textContent = 'Check This Screenshot';
    resultSection.hidden = true;
    setStep(1);
}

function resetFile() {
    selectedFile = null;
    fileInput.value = '';
    uploadArea.hidden = false;
    previewWrap.hidden = true;
    previewImg.src = '';
    fileName.textContent = 'No file selected';
    checkBtn.disabled = true;
    btnText.textContent = 'Select screenshot to start';
    resultSection.hidden = true;
    setStep(1);
}

checkBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    checkBtn.disabled = true;
    btnText.textContent = 'Analyzing...';
    btnSpinner.hidden = false;
    resultSection.hidden = true;
    try {
        const formData = new FormData();
        formData.append('screenshot', selectedFile);
        const platform = platformSelect.value;
        if (platform) formData.append('platform', platform);

        const response = await fetch(`${API_BASE}/api/check`, { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 429) return showUpgradePrompt(data);
            return showError(data.message || 'Analysis failed. Please try again.');
        }
        renderResult(data);
        if (typeof data.checksRemaining === 'number') {
            checksRemaining.textContent = `${data.checksRemaining} free checks remaining today`;
            const usedToday = 10 - data.checksRemaining;
            updateChecksDoneCounter(usedToday);
        } else {
            updateChecksDoneCounter(existingCount + 1);
        }
        setStep(2);
    } catch (err) {
        showError('Network error. Check your connection and try again.');
    } finally {
        checkBtn.disabled = false;
        btnText.textContent = 'Check Another Screenshot';
        btnSpinner.hidden = true;
    }
});

verifySmsBtn.addEventListener('click', async () => {
    const smsText = smsTextInput.value.trim();
    const platform = detectedSmsPlatform;
    if (!platform) return smsStatus.textContent = 'Platform not detected. SMS must contain Easypaisa or JazzCash keyword.';
    if (!smsText || smsText.length < 8) return smsStatus.textContent = 'Please paste valid received SMS text.';

    verifySmsBtn.disabled = true;
    smsStatus.textContent = 'Verifying SMS text...';
    try {
        const response = await fetch(`${API_BASE}/api/sms/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, smsText }),
        });
        const data = await response.json();
        if (!response.ok) return smsStatus.textContent = data.message || 'SMS verification failed.';
        renderSmsVerificationResult(data);
        smsStatus.textContent = data.status === 'CONFIRMED'
            ? 'SMS recognized and fields extracted successfully.'
            : 'SMS unrecognized. Please verify platform or SMS format.';
    } catch (err) {
        smsStatus.textContent = 'Network error while verifying SMS.';
    } finally {
        verifySmsBtn.disabled = false;
    }
});

function renderResult(data) {
    const { risk, score, platform, issues = [], warnings = [], ocrConfidence, disclaimer, signalBreakdown = [] } = data;
    const riskEmoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴' }[risk] || '⚪';
    const riskLabel = { LOW: 'LOW RISK', MEDIUM: 'MEDIUM RISK', HIGH: 'HIGH RISK' }[risk] || 'UNKNOWN';
    const issuesHtml = issues.length ? `<p class="result-section-title">Problems Found</p><ul class="issue-list">${issues.map((item) => `<li>${escHtml(item)}</li>`).join('')}</ul>` : '';
    const warningsHtml = warnings.length ? `<p class="result-section-title">Warnings</p><ul class="warning-list">${warnings.map((item) => `<li>${escHtml(item)}</li>`).join('')}</ul>` : '';
    const signalHtml = signalBreakdown.length ? `<p class="result-section-title">Signal Breakdown</p><ul class="signal-list">${signalBreakdown.slice(0, 6).map((s) => `<li>${escHtml(s.name)}: ${escHtml(s.reason)}</li>`).join('')}</ul>` : '';
    const cleanHtml = (!issues.length && !warnings.length) ? `<p style="color:#9fffc6;font-weight:700;margin-top:14px;">No major issues detected. Screenshot appears consistent with ${escHtml(platform)} record.</p>` : '';

    resultCard.innerHTML = `
      <div class="result-header">
        <div class="risk-badge risk-${risk}">${riskEmoji} ${riskLabel}</div>
        <div class="result-meta">
          <div class="result-platform">${escHtml(platform)}</div>
          <div class="result-score">Risk score: ${score}/100</div>
        </div>
      </div>
      <div class="score-bar-bg"><div class="score-bar-fill bar-${risk}" style="width:${score}%"></div></div>
      <div class="result-body">
        ${issuesHtml}${warningsHtml}${signalHtml}${cleanHtml}
        ${ocrConfidence !== undefined ? `<p class="ocr-confidence">OCR confidence: ${ocrConfidence}%</p>` : ''}
      </div>
      <button class="recheck-btn" id="recheckBtn" type="button">Check Another Screenshot</button>
      <div class="result-disclaimer">${escHtml(disclaimer || '')}</div>
    `;
    document.getElementById('recheckBtn').addEventListener('click', resetFile);
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showUpgradePrompt() {
    resultCard.innerHTML = `
      <div style="padding:24px;text-align:center;">
        <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:8px;">Daily Limit Reached</h3>
        <p style="color:#b0bfdd;">You have used all free checks for today.</p>
      </div>
    `;
    resultSection.hidden = false;
}

function showError(message) {
    resultCard.innerHTML = `<div style="padding:24px;text-align:center;color:#ff9faa;"><p style="font-weight:700;">${escHtml(message)}</p></div>`;
    resultSection.hidden = false;
}

function detectSmsPlatform(text) {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('easypaisa') || lower.includes('easy paisa')) return 'easypaisa';
    if (lower.includes('jazzcash') || lower.includes('jazz cash')) return 'jazzcash';
    return null;
}

function handleSmsTextChanged() {
    detectedSmsPlatform = detectSmsPlatform(smsTextInput.value);
    if (!detectedSmsPlatform) {
        smsDetectedPlatform.textContent = 'Not detected';
        smsStatus.textContent = 'Paste SMS containing Easypaisa or JazzCash for auto detect.';
        return;
    }
    smsDetectedPlatform.textContent = detectedSmsPlatform;
    smsStatus.textContent = `Platform auto-detected: ${detectedSmsPlatform}`;
}

function renderSmsVerificationResult(data) {
    const { status, platform, extracted = {}, missingFields = [] } = data;
    const statusClass = status === 'CONFIRMED' ? 'sms-status-confirmed' : 'sms-status-unrecognized';
    const amountText = extracted.amount || 'Not found';
    const senderText = extracted.senderName || 'Not found';
    const txText = extracted.transactionId || 'Not found';
    const successMessage = status === 'CONFIRMED'
        ? `<div class="sms-success-message">Payment Received! Rs.${escHtml(amountText)} successfully received from ${escHtml(senderText)}. Transaction ID: ${escHtml(txText)}. You can safely dispatch the order.</div>`
        : '';
    const missingHtml = missingFields.length ? `<p class="sms-missing">Missing: ${missingFields.map((item) => escHtml(item)).join(', ')}</p>` : '';

    smsResult.innerHTML = `
      <div class="sms-status-chip ${statusClass}">${escHtml(status)}</div>
      ${successMessage}
      <p><strong>Platform:</strong> ${escHtml(platform || '-')}</p>
      <p><strong>Amount:</strong> ${escHtml(amountText)}</p>
      <p><strong>Sender Name:</strong> ${escHtml(senderText)}</p>
      <p><strong>Transaction ID:</strong> ${escHtml(txText)}</p>
      ${missingHtml}
    `;
    smsResult.hidden = false;
}

function setActiveMode(mode) {
    const isScreenshotMode = mode === 'screenshot';
    screenshotPane.hidden = !isScreenshotMode;
    smsPane.hidden = isScreenshotMode;
    screenshotTabBtn.classList.toggle('is-active', isScreenshotMode);
    smsTabBtn.classList.toggle('is-active', !isScreenshotMode);
    if (!isScreenshotMode) resultSection.hidden = true;
}

function setStep(activeStep) {
    const steps = stepper.querySelectorAll('.step');
    steps.forEach((el) => {
        const stepNum = Number(el.dataset.step);
        el.classList.toggle('is-active', stepNum <= activeStep);
    });
}

function updateChecksDoneCounter(value) {
    const finalValue = Math.max(0, Number(value) || 0);
    checksDoneToday.textContent = String(finalValue);
    localStorage.setItem(CHECKS_COUNTER_KEY, String(finalValue));
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

setActiveMode('screenshot');