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
const resultSection = document.getElementById('resultSection');
const resultCard = document.getElementById('resultCard');

let selectedFile = null;

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('drag-over'); });
uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('drag-over'); const file = e.dataTransfer.files[0]; if (file) handleFileSelect(file); });
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFileSelect(fileInput.files[0]); });
clearBtn.addEventListener('click', (e) => { e.stopPropagation(); resetFile(); });

function handleFileSelect(file) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { showError('Please upload JPG, PNG, or WEBP image'); return; }
    if (file.size > 8 * 1024 * 1024) { showError('File too large. Max 8MB.'); return; }
    selectedFile = file;
    fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => { previewImg.src = e.target.result; uploadArea.hidden = true; previewWrap.hidden = false; };
    reader.readAsDataURL(file);
    checkBtn.disabled = false;
    btnText.textContent = 'Check This Screenshot';
    resultSection.hidden = true;
}

function resetFile() {
    selectedFile = null;
    fileInput.value = '';
    uploadArea.hidden = false;
    previewWrap.hidden = true;
    previewImg.src = '';
    fileName.textContent = 'No file selected';
    checkBtn.disabled = true;
    btnText.textContent = 'Select a screenshot to check';
    resultSection.hidden = true;
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
        const response = await fetch('/api/check', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 429) showUpgradePrompt(data);
            else showError(data.message || 'Analysis failed. Please try again.');
            return;
        }
        renderResult(data);
        if (typeof data.checksRemaining === 'number') {
            checksRemaining.textContent = `${data.checksRemaining} free checks remaining today`;
        }
    } catch (err) {
        showError('Network error. Check your connection and try again.');
    } finally {
        checkBtn.disabled = false;
        btnText.textContent = 'Check Another Screenshot';
        btnSpinner.hidden = true;
    }
});

function renderResult(data) {
    const { risk, score, platform, issues = [], warnings = [], ocrConfidence, disclaimer } = data;
    const riskEmoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴' }[risk] || '⚪';
    const riskLabel = { LOW: 'LOW RISK', MEDIUM: 'MEDIUM RISK', HIGH: 'HIGH RISK' }[risk] || 'UNKNOWN';

    let issuesHtml = issues.length > 0 ? `<p class="result-section-title">Problems Found</p><ul class="issue-list">${issues.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>` : '';
    let warningsHtml = warnings.length > 0 ? `<p class="result-section-title">Warnings</p><ul class="warning-list">${warnings.map(w => `<li>${escHtml(w)}</li>`).join('')}</ul>` : '';
    let cleanHtml = issues.length === 0 && warnings.length === 0 ? `<p style="color:var(--green);font-weight:600;margin-top:16px;">✓ No issues detected. Screenshot appears consistent with a genuine ${escHtml(platform)} receipt.</p>` : '';

    resultCard.innerHTML = `
    <div class="result-header">
      <div class="risk-badge risk-${risk}">${riskEmoji} ${riskLabel}</div>
      <div class="result-meta">
        <div class="result-platform">${escHtml(platform)}</div>
        <div class="result-score">Risk score: ${score}/100</div>
      </div>
    </div>
    <div class="score-bar-wrap">
      <div class="score-bar-bg">
        <div class="score-bar-fill bar-${risk}" style="width:${score}%"></div>
      </div>
    </div>
    <div class="result-body">
      ${issuesHtml}${warningsHtml}${cleanHtml}
      ${ocrConfidence !== undefined ? `<p class="ocr-confidence">OCR confidence: ${ocrConfidence}% — ${ocrConfidence >= 70 ? 'good image quality' : ocrConfidence >= 40 ? 'acceptable quality' : 'poor quality — upload clearer screenshot'}</p>` : ''}
    </div>
    <button class="recheck-btn" id="recheckBtn">Check Another Screenshot</button>
    <div class="result-disclaimer">${escHtml(disclaimer)}</div>`;

    document.getElementById('recheckBtn').addEventListener('click', resetFile);
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showUpgradePrompt(data) {
    resultCard.innerHTML = `
    <div style="padding:28px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:12px;">⚡</div>
      <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:8px;">Daily Limit Reached</h3>
      <p style="color:var(--gray-600);font-size:0.9rem;margin-bottom:20px;">You've used all 10 free checks for today.</p>
      <a href="/pricing.html" style="display:inline-block;background:var(--blue);color:white;padding:10px 28px;border-radius:8px;font-weight:700;text-decoration:none;">See Pro Plans →</a>
      <p style="margin-top:12px;font-size:0.8rem;color:var(--gray-400);">Or come back tomorrow for 10 more free checks.</p>
    </div>`;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function showError(msg) {
    resultCard.innerHTML = `<div style="padding:24px;text-align:center;color:var(--red);"><div style="font-size:1.5rem;margin-bottom:8px;">⚠️</div><p style="font-weight:600;">${escHtml(msg)}</p></div>`;
    resultSection.hidden = false;
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}