import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://lnlptdamwvoorlejmkre.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_p9c5pIN2SqiQFDPHrgpLlQ_WGmfLhgv';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const REMEMBER_KEY = 'site_remember_until';
const authFlow = document.getElementById('auth-flow');
const siteContent = document.getElementById('site-content');

async function requestPermissions() {
    if(Notification.permission === 'default') {
        await Notification.requestPermission();
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.warn('Camera permission not granted:', err);
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const steps = {
    splash: document.getElementById('step-splash'),
    email: document.getElementById('step-email'),
    password: document.getElementById('step-password'),
    enroll: document.getElementById('step-enroll'),
    mfa: document.getElementById('step-mfa')
};

const authBackBtn = document.getElementById('auth-back-btn');
let stepHistory = [];

function showStep(name, { record = true } = {}) {
    Object.values(steps).forEach(step => step.classList.add('hide'));
    steps[name].classList.remove('hide');

    if(name === 'splash') {
        stepHistory = [];
    } else if(record) {
        stepHistory.push(name);
    }

    authBackBtn.classList.toggle('hide', stepHistory.length <= 1);
}

function goToPreviousAuthStep() {
    if(stepHistory.length <= 1) return;
    stepHistory.pop();
    const prev = stepHistory[stepHistory.length - 1];
    showStep(prev, { record: false });
}

authBackBtn.addEventListener('click', goToPreviousAuthStep);
document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !authFlow.classList.contains('hide') && stepHistory.length > 1) {
        goToPreviousAuthStep();
    }
});

let pendingEmail = '';
let pendingFactorId = null;

document.getElementById('btn-email-next').addEventListener('click', () => {
    pendingEmail = document.getElementById('input-email').value.trim();
    if(!pendingEmail) return;
    showStep('password');
});

document.getElementById('btn-password-next').addEventListener('click', async () => {
    requestPermissions();

    const password = document.getElementById('input-password').value;
    const errorEl = document.getElementById('error-password');

    const { error } = await supabase.auth.signInWithPassword({ email: pendingEmail, password });
    if(error) { errorEl.textContent = 'Wrong email or passcode'; return; }
    errorEl.textContent = '';

    const { data: factors } = await supabase.auth.mfa.listFactors();
    if(factors.totp.length === 0) {
        await startEnrollment();
    } else {
        pendingFactorId = factors.totp[0].id;
        showStep('mfa');
    }
});

async function startEnrollment() {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const stale = (factors.all || []).filter(f => f.factor_type === 'totp' && f.status === 'unverified');

    for (const factor of stale) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) console.error('Failed to remove stale factor:', unenrollError);
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' });
    if(error) {
        console.error('MFA enroll error:', error);
        document.getElementById('error-password').textContent = 'Could not start 2FA setup';
        return;
    }
    pendingFactorId = data.id;
    document.getElementById('enroll-qr').src = data.totp.qr_code;
    showStep('enroll');
}

document.getElementById('btn-enroll-verify').addEventListener('click', async () => {
    await runChallenge(pendingFactorId, 'input-enroll-code', 'error-enroll');
});
document.getElementById('btn-mfa-verify').addEventListener('click', async () => {
    await runChallenge(pendingFactorId, 'input-mfa-code', 'error-mfa');
});

async function runChallenge(factorId, inputId, errorId) {
    const code = document.getElementById(inputId).value;
    const errorEl = document.getElementById(errorId);

    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if(challenge.error) { errorEl.textContent = 'Something went wrong'; return; }

    const verify = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if(verify.error) { errorEl.textContent = 'Wrong code, try again'; return; }

    finishLogin();
}

function getRememberUntil() {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    lastDay.setHours(8, 0, 0, 0);
    return lastDay.getTime();
}

function isRemembered() {
    const until = localStorage.getItem(REMEMBER_KEY);
    return until && Date.now() < parseInt(until, 10);
}

async function finishLogin() {
    const remember = document.getElementById('input-remember').checked;
    if(remember) { localStorage.setItem(REMEMBER_KEY, getRememberUntil()); }
    showStep('splash');
    await wait(1800);
    revealSite();
}

const MX_ID = 'a41384e6-0a4f-4eff-a59e-92b28c0e3929';
const IT_ID = 'ddaffa71-b778-4978-9780-b4a3ca9451ef';

function updateClockOnline(onlineIds) {
    const mxEl = document.getElementById('clock-online-mx');
    const itEl = document.getElementById('clock-online-it');

    onlineIds.includes(MX_ID) ? mxEl.classList.remove('hide') : mxEl.classList.add('hide');
    onlineIds.includes(IT_ID) ? itEl.classList.remove('hide') : itEl.classList.add('hide');
}

function setupPresence(userId) {
    const channel = supabase.channel('site-presence', {
        config: { presence: { key: userId } },
    });
    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = Object.keys(state);
        updateClockOnline(onlineIds);
    });
    channel.subscribe(async (status) => {
        if(status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
        }
    });
}

export let currentUserLabel = null;

async function loadProtectedImage(imgElement, path) {
    const { data, error } = await supabase.storage
        .from('private-photos')
        .createSignedUrl(path, 60 * 60);
    if(error) { console.error('Could not load protected image:', path, error); return; }
    imgElement.src = data.signedUrl;
}

function loadProtectedAssets() {
    document.querySelectorAll('.protected-photo').forEach(img => {
        loadProtectedImage(img, img.dataset.supabasePath);
    });
}

async function revealSite() {
    authFlow.classList.add('hide');
    siteContent.classList.remove('hide');
    loadProtectedAssets();

    document.dispatchEvent(new CustomEvent('site-revealed'));

    const { data: { user } } = await supabase.auth.getUser();
    if(user) {
        currentUserLabel = user.user_metadata?.label || 'someone';
        setupPresence(user.id);
    }
}

(async () => {
    showStep('splash');
    if(isRemembered()) {
        const { data: { session } } = await supabase.auth.getSession();
        if(session) {
            const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if(level.currentLevel === 'aal2') {
                requestPermissions();
                await wait(1800);
                revealSite(); 
                return; 
            }
        }
    }
    localStorage.removeItem(REMEMBER_KEY);
    await supabase.auth.signOut();
    await wait(1800);
    showStep('email');
})();

function bindEnterToSubmit(inputId, buttonId) {
    document.getElementById(inputId).addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            document.getElementById(buttonId).click();
        }
    });
}

bindEnterToSubmit('input-email', 'btn-email-next');
bindEnterToSubmit('input-password', 'btn-password-next');
bindEnterToSubmit('input-enroll-code', 'btn-enroll-verify');
bindEnterToSubmit('input-mfa-code', 'btn-mfa-verify');