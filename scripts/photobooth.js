import { supabase, currentUserLabel } from './auth.js';

const MX_LABEL = 'chimuelita';
const IT_LABEL = 'loco';

const STRIP_BACKGROUNDS = [
    {
        id: 'ily',
        label: 'ILY',
        bg: { 3: 'assets/strips/bg/ily-3.png', 4: 'assets/strips/bg/ily-4.png' },
    },
    {
        id: 'og',
        label: 'OG',
        bg: { 3: 'assets/strips/bg/og-3.png', 4: 'assets/strips/bg/og-4.png' },
        overlay: { 3: 'assets/strips/ov/og-3.png', 4: 'assets/strips/ov/og-4.png' },
    },
];

function currentBgImage() {
    return selectedBg.bg[slotCount] || selectedBg.bg[3];
}
function currentOverlayImage() {
    return selectedBg.overlay ? (selectedBg.overlay[slotCount] || null) : null;
}

const SLOT_MODE_OPTIONS = [
    { value: 'self',        label: () => `Just me (${currentUserLabel || 'me'})` },
    { value: 'partner',     label: () => `Just her/him` },
    { value: 'split-self-left',  label: () => `Split — me left` },
    { value: 'split-self-right', label: () => `Split — me right` },
];

let slotCount = 3;
let selectedBg = STRIP_BACKGROUNDS[0];
let slotModes = [];

const setupScreen = document.getElementById('strip-setup');
const captureScreen = document.getElementById('strip-capture');
const resultScreen = document.getElementById('strip-result');
const slotModesEl = document.getElementById('strip-slot-modes');
const bgOptionsEl = document.getElementById('strip-bg-options');
const setupStatusEl = document.getElementById('strip-setup-status');
const captureStatusEl = document.getElementById('strip-capture-status');
const stripFrameEl = document.getElementById('strip-frame');
const countdownBadgeEl = document.getElementById('strip-countdown-badge');
const finalCanvas = document.getElementById('strip-final-canvas');

function myLabel() {
    return currentUserLabel;
}
function partnerLabel() {
    return currentUserLabel === MX_LABEL ? IT_LABEL : MX_LABEL;
}

function renderSlotModeOptions() {
    slotModesEl.innerHTML = '<label>Photo modes</label>';
    slotModes = Array.from({ length: slotCount }, (_, i) => slotModes[i] || 'self');

    for (let i = 0; i < slotCount; i++) {
        const row = document.createElement('div');
        row.className = 'strip-slot-row';

        const label = document.createElement('span');
        label.textContent = `Slot ${i + 1}`;

        const select = document.createElement('select');
        select.dataset.slotIndex = i;
        SLOT_MODE_OPTIONS.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value;
            optionEl.textContent = opt.label();
            if (opt.value === slotModes[i]) optionEl.selected = true;
            select.appendChild(optionEl);
        });
        select.addEventListener('change', () => {
            slotModes[i] = select.value;
            brodcastSetupUpdate();
        });

        row.append(label, select);
        slotModesEl.appendChild(row);
    }
}

function renderBgOptions() {
    bgOptionsEl.innerHTML = '';
    STRIP_BACKGROUNDS.forEach(bg => {
        const img = document.createElement('img');
        img.src = bg.bg[slotCount] || bg.bg[3];
        img.className = 'strip-bg-thumb' + (bg.id === selectedBg.id ? ' active' : '');
        img.addEventListener('click', () => {
            selectedBg = bg;
            renderBgOptions();
            broadcastSetupUpdate();
        });
        bgOptionsEl.appendChild(img);
    });
}

document.querySelectorAll('.strip-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.strip-count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        slotCount = parseInt(btn.dataset.count, 10);
        renderSlotModeOptions();
        renderBgOptions();
        broadcastSetupUpdate();
    });
});

renderSlotModeOptions();
renderBgOptions();

const stripChannel = supabase.channel('photobooth-session');
let sessionActive = false;
let localStream = null;
let localVideoEl = null;
let capturedFrames = {}; // { slotIndex: { [label]: dataUrl } }
let resolveFrameWaiters = {}; // { `${slotIndex}-${label}`: resolveFn }

stripChannel.on('broadcast', { event: 'session-start' }, ({ payload }) => {
    if (sessionActive) return;
    startCaptureFlow(payload.slotCount, payload.slotModes, payload.bgId, false);
});

stripChannel.on('broadcast', { event: 'frame' }, ({ payload }) => {
    const key = `${payload.slot}-${payload.label}`;
    capturedFrames[payload.slot] = capturedFrames[payload.slot] || {};
    capturedFrames[payload.slot][payload.label] = payload.dataUrl;
    if (resolveFrameWaiters[key]) {
        resolveFrameWaiters[key]();
        delete resolveFrameWaiters[key];
    }
});

stripChannel.subscribe();

document.getElementById('strip-start-btn').addEventListener('click', () => {
    stripChannel.send({
        type: 'broadcast',
        event: 'session-start',
        payload: { slotCount, slotModes, bgId: selectedBg.id }
    });
    startCaptureFlow(slotCount, slotModes, selectedBg.id, true);
});

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureCamera() {
    if (localStream) return;
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    localVideoEl = document.createElement('video');
    localVideoEl.srcObject = localStream;
    localVideoEl.autoplay = true;
    localVideoEl.muted = true;
    localVideoEl.playsInline = true;
    await localVideoEl.play();
}

function captureLocalFrameDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // mirror, feels natural for a selfie cam
    ctx.drawImage(localVideoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
}

function slotNeedsSelf(mode) {
    return mode !== 'partner';
}
function slotNeedsPartner(mode) {
    return mode !== 'self';
}

async function startCaptureFlow(count, modes, bgId, isInitiator) {
    sessionActive = true;
    capturedFrames = {};
    slotCount = count;
    slotModes = modes;
    selectedBg = STRIP_BACKGROUNDS.find(b => b.id === bgId) || STRIP_BACKGROUNDS[0];

    setupScreen.classList.add('hide');
    captureScreen.classList.remove('hide');
    resultScreen.classList.add('hide');
    captureStatusEl.textContent = '';

    try {
        await ensureCamera();
        buildSlotPreviews();

        for (let i = 0; i < slotCount; i++) {
            await runCountdown(3);
            await captureSlot(i);
        }

        await renderFinalStrip();

        captureScreen.classList.add('hide');
        resultScreen.classList.remove('hide');
    } catch (err) {
        console.error('Photo booth error:', err);
        captureStatusEl.textContent = 'Something went wrong — try again.';
    } finally {
        sessionActive = false;
    }
}

function buildSlotPreviews() {
    stripFrameEl.style.backgroundImage = `url('${currentBgImage()}')`;
    stripFrameEl.style.aspectRatio = `${STRIP_WIDTH} / ${stripHeight(slotCount)}`;
    stripFrameEl.style.setProperty('--top-pad', `${TOP_MARGIN * PREVIEW_SCALE}px`);
    stripFrameEl.style.setProperty('--bottom-pad', `${BOTTOM_MARGIN * PREVIEW_SCALE}px`);
    stripFrameEl.style.setProperty('--side-pad', `${SIDE_MARGIN * PREVIEW_SCALE}px`);
    stripFrameEl.style.setProperty('--slot-gap', `${SLOT_GAP * PREVIEW_SCALE}px`);
    stripFrameEl.innerHTML = '';
    for (let i = 0; i < slotCount; i++) {
        const preview = document.createElement('div');
        preview.className = 'strip-slot-preview';
        preview.id = `strip-slot-preview-${i}`;
        stripFrameEl.appendChild(preview);
    }
}

async function runCountdown(seconds) {
    for (let s = seconds; s > 0; s--) {
        countdownBadgeEl.textContent = s;
        captureStatusEl.textContent = 'get ready...';
        await wait(1000);
    }
    countdownBadgeEl.textContent = '📸';
    await wait(200);
}

async function captureSlot(slotIndex) {
    const mode = slotModes[slotIndex];
    const dataUrl = captureLocalFrameDataUrl();

    stripChannel.send({
        type: 'broadcast',
        event: 'frame',
        payload: { slot: slotIndex, label: currentUserLabel, dataUrl }
    });
    capturedFrames[slotIndex] = capturedFrames[slotIndex] || {};
    capturedFrames[slotIndex][currentUserLabel] = dataUrl;

    const previewEl = document.getElementById(`strip-slot-preview-${slotIndex}`);
    if (previewEl) {
        const img = document.createElement('img');
        img.src = dataUrl;
        previewEl.appendChild(img);
    }

    // wait (with timeout) for partner's frame if this slot needs it
    if (slotNeedsPartner(mode)) {
        captureStatusEl.textContent = 'waiting for the other camera...';
        const key = `${slotIndex}-${partnerLabel()}`;
        const already = capturedFrames[slotIndex]?.[partnerLabel()];
        if (!already) {
            await Promise.race([
                new Promise(resolve => { resolveFrameWaiters[key] = resolve; }),
                wait(8000) // don't hang forever if partner isn't online
            ]);
        }
        captureStatusEl.textContent = '';
    }
}

const STRIP_WIDTH = 440;
const SLOT_WIDTH = 400, SLOT_HEIGHT = 300;
const SLOT_GAP = 12;
const SIDE_MARGIN = (STRIP_WIDTH - SLOT_WIDTH)/2;
const TOP_MARGIN = 100, BOTTOM_MARGIN = 100;

function stripHeight(count) {
    return TOP_MARGIN + count * SLOT_HEIGHT + (count-1) * SLOT_GAP + BOTTOM_MARGIN;
}

async function renderFinalStrip() {
    const strip_w = STRIP_WIDTH;
    const strip_h = stripHeight(slotCount);

    finalCanvas.width = strip_w;
    finalCanvas.height = strip_h;
    const ctx = finalCanvas.getContext('2d');

    const bgImg = await loadImage(currentBgImage());
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, strip_w, strip_h);
    } else {
        ctx.fillStyle = '#fdf6e3';
        ctx.fillRect(0, 0, strip_w, strip_h);
    }

    for (let i = 0; i < slotCount; i++) {
        const mode = slotModes[i];
        const y = TOP_MARGIN + i * (SLOT_HEIGHT + SLOT_GAP);
        const frames = capturedFrames[i] || {};
        const selfUrl = frames[currentUserLabel];
        const partnerUrl = frames[partnerLabel()];

        if (mode === 'self') {
            await drawCover(ctx, selfUrl, SIDE_MARGIN, y, SLOT_WIDTH, SLOT_HEIGHT);
        } else if (mode === 'partner') {
            await drawCover(ctx, partnerUrl || selfUrl, SIDE_MARGIN, y, SLOT_WIDTH, SLOT_HEIGHT);
        } else if (mode === 'split-self-left') {
            await drawCover(ctx, selfUrl, SIDE_MARGIN, y, SLOT_WIDTH / 2, SLOT_HEIGHT);
            await drawCover(ctx, partnerUrl || selfUrl, SIDE_MARGIN + SLOT_WIDTH / 2, y, SLOT_WIDTH / 2, SLOT_HEIGHT);
        } else if (mode === 'split-self-right') {
            await drawCover(ctx, partnerUrl || selfUrl, SIDE_MARGIN, y, SLOT_WIDTH / 2, SLOT_HEIGHT);
            await drawCover(ctx, selfUrl, SIDE_MARGIN + SLOT_WIDTH / 2, y, SLOT_WIDTH / 2, SLOT_HEIGHT);
        }
    }

    const overlayPath = currentOverlayImage();
    if (overlayPath) {
        const overlayImg = await loadImage(overlayPath);
        if (overlayImg) ctx.drawImage(overlayImg, 0, 0, strip_w, strip_h);
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

async function drawCover(ctx, dataUrl, x, y, w, h) {
    if (!dataUrl) return;
    const img = await loadImage(dataUrl);
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale, sh = h / scale;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

document.getElementById('strip-download-btn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `photobooth-${Date.now()}.png`;
    link.href = finalCanvas.toDataURL('image/png');
    link.click();
});

document.getElementById('strip-retake-btn').addEventListener('click', () => {
    resultScreen.classList.add('hide');
    setupScreen.classList.remove('hide');
});

function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideoEl = null;
}

const stripsUiEl = document.getElementById('strips-ui');
const stripsVisibilityObserver = new MutationObserver(() => {
    if (stripsUiEl.classList.contains('hide')) {
        stopCamera();
    }
});
stripsVisibilityObserver.observe(stripsUiEl, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('beforeunload', stopCamera);

function broadcastSetupUpdate() {
    if (sessionActive) return;
    stripChannel.send({
        type: 'broadcast',
        event: 'setup-update',
        payload: { slotCount, slotModes, bgId: selectedBg.id }
    });
}

let applyingRemoteUpdate = false;

stripChannel.on('broadcast', { event: 'setup-update' }, ({ payload }) => {
    if (sessionActive) return;

    applyingRemoteUpdate = true;

    slotCount = payload.slotCount;
    slotModes = payload.slotModes;
    selectedBg = STRIP_BACKGROUNDS.find(b => b.id === payload.bgId) || STRIP_BACKGROUNDS[0];

    document.querySelectorAll('.strip-count-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.count, 10) === slotCount);
    });

    renderSlotModeOptions();
    renderBgOptions();

    applyingRemoteUpdate = false;
});