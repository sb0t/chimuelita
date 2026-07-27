import { supabase, currentUserLabel } from './auth.js';

const MX_LABEL = 'chimuelita';
const IT_LABEL = 'loco';

const STRIP_BACKGROUNDS = [
    { id: 'cream',   thumb: 'assets/strips/bg/cream-thumb.png',   image: 'assets/strips/bg/cream.png' },
    { id: 'polaroid',thumb: 'assets/strips/bg/polaroid-thumb.png',image: 'assets/strips/bg/polaroid.png' },
    { id: 'hearts',  thumb: 'assets/strips/bg/hearts-thumb.png',  image: 'assets/strips/bg/hearts.png', overlay: 'assets/strips/bg/hearts-overlay.png' },
    { id: 'film',    thumb: 'assets/strips/bg/film-thumb.png',    image: 'assets/strips/bg/film.png' },
];

const SLOT_MODE_OPTIONS = [
    { value: 'self',        label: () => `Just me (${currentUserLabel || 'me'})` },
    { value: 'partner',     label: () => `Just her/him` },
    { value: 'split-self-left',  label: () => `Split — me left` },
    { value: 'split-self-right', label: () => `Split — me right` },
];

let slotCount = 3;
let selectedBg = STRIP_BACKGROUNDS[0];
let showDate = true;
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
        });

        row.append(label, select);
        slotModesEl.appendChild(row);
    }
}

function renderBgOptions() {
    bgOptionsEl.innerHTML = '';
    STRIP_BACKGROUNDS.forEach(bg => {
        const img = document.createElement('img');
        img.src = bg.thumb;
        img.className = 'strip-bg-thumb' + (bg.id === selectedBg.id ? ' active' : '');
        img.addEventListener('click', () => {
            selectedBg = bg;
            renderBgOptions();
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
    });
});

document.getElementById('strip-date-toggle').addEventListener('change', (e) => {
    showDate = e.target.checked;
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
    if (sessionActive) return; // ignore broadcast bouncing back if using self-broadcast
    startCaptureFlow(payload.slotCount, payload.slotModes, payload.bgId, payload.showDate, false);
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
        payload: { slotCount, slotModes, bgId: selectedBg.id, showDate }
    });
    startCaptureFlow(slotCount, slotModes, selectedBg.id, showDate, true);
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

async function startCaptureFlow(count, modes, bgId, dateOn, isInitiator) {
    sessionActive = true;
    capturedFrames = {};
    slotCount = count;
    slotModes = modes;
    selectedBg = STRIP_BACKGROUNDS.find(b => b.id === bgId) || STRIP_BACKGROUNDS[0];
    showDate = dateOn;

    setupScreen.classList.add('hide');
    captureScreen.classList.remove('hide');
    resultScreen.classList.add('hide');
    captureStatusEl.textContent = '';

    try {
        await ensureCamera();
    } catch (err) {
        captureStatusEl.textContent = 'Camera permission needed — check your browser settings.';
        sessionActive = false;
        return;
    }

    buildSlotPreviews();

    for (let i = 0; i < slotCount; i++) {
        await runCountdown(3);
        await captureSlot(i);
    }

    await renderFinalStrip();

    captureScreen.classList.add('hide');
    resultScreen.classList.remove('hide');
    sessionActive = false;
}

function buildSlotPreviews() {
    stripFrameEl.style.backgroundImage = `url('${selectedBg.image}')`;
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

    // show local preview immediately
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

async function renderFinalStrip() {
    const SLOT_W = 400, SLOT_H = 300, PAD = 24, GAP = 14;
    const strip_w = SLOT_W + PAD * 2;
    const strip_h = PAD * 2 + slotCount * SLOT_H + (slotCount - 1) * GAP + (showDate ? 40 : 0);

    finalCanvas.width = strip_w;
    finalCanvas.height = strip_h;
    const ctx = finalCanvas.getContext('2d');

    const bgImg = await loadImage(selectedBg.image);
    ctx.drawImage(bgImg, 0, 0, strip_w, strip_h);

    for (let i = 0; i < slotCount; i++) {
        const mode = slotModes[i];
        const y = PAD + i * (SLOT_H + GAP);
        const frames = capturedFrames[i] || {};
        const selfUrl = frames[currentUserLabel];
        const partnerUrl = frames[partnerLabel()];

        if (mode === 'self') {
            await drawCover(ctx, selfUrl, PAD, y, SLOT_W, SLOT_H);
        } else if (mode === 'partner') {
            await drawCover(ctx, partnerUrl || selfUrl, PAD, y, SLOT_W, SLOT_H);
        } else if (mode === 'split-self-left') {
            await drawCover(ctx, selfUrl, PAD, y, SLOT_W / 2, SLOT_H);
            await drawCover(ctx, partnerUrl || selfUrl, PAD + SLOT_W / 2, y, SLOT_W / 2, SLOT_H);
        } else if (mode === 'split-self-right') {
            await drawCover(ctx, partnerUrl || selfUrl, PAD, y, SLOT_W / 2, SLOT_H);
            await drawCover(ctx, selfUrl, PAD + SLOT_W / 2, y, SLOT_W / 2, SLOT_H);
        }
    }

    if (selectedBg.overlay) {
        const overlayImg = await loadImage(selectedBg.overlay);
        ctx.drawImage(overlayImg, 0, 0, strip_w, strip_h);
    }

    if (showDate) {
        ctx.fillStyle = '#4a3728';
        ctx.font = '20px Caveat, cursive';
        ctx.textAlign = 'center';
        const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        ctx.fillText(dateStr, strip_w / 2, strip_h - 14);
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
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