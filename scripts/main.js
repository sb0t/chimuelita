const main = document.querySelector("#main");
const interactEls = document.querySelectorAll(".interact");
const darken = document.querySelector(".darken");
const backBtn = document.getElementById("back-btn");
let currentUI = null;

const START = new Date("March 31, 2026 00:00:00");
const MERIDA = new Date("August 29, 2026 18:05:00");
const daysLeft = Math.floor((MERIDA.getTime()-new Date().getTime())/(1000*60*60*24));
const introLines = [
    { text: "hola chimuelita", pause: 1000 },
    { text: "4 months already!?", pause: 1000 },
    { text: "couldn't let you beat me at sites...", pause: 1200 },
    { text: "i win", pause: 1400 },
    { text: `see you in ${daysLeft} days`, pause: 2000 },
    { text: "xoxo,", pause: 800 },
    { text: "loco ♡", pause: 2000 }
];
const introLine = document.getElementById("intro-line");
const introText = document.getElementById("intro-text");

function typeLine(text, speed = 60) {
    return new Promise(resolve => {
        let i = 0;
        introLine.textContent = "";
        const interval = setInterval(() => {
            introLine.textContent += text[i];
            i++;
            if(i >= text.length) {
                clearInterval(interval);
                resolve();
            }
        }, speed);
    });
}
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function playIntro() {
    await wait(2000); // delay
    for(const line of introLines) {
        await typeLine(line.text);
        await wait(line.pause);
    }
    introText.classList.add("fade-out");
    await wait(1200);
    introText.remove();
}
document.addEventListener('site-revealed', playIntro, { once: true });

function updateDaysTogether() {
    const daysTogetherEl = document.getElementById("days-together");
    if(!daysTogetherEl) return;
    const daysTogether = Math.floor((new Date().getTime()-START.getTime())/(1000*60*60*24));
    daysTogetherEl.textContent = `${daysTogether.toLocaleString()} days together`;
}
updateDaysTogether();
setInterval(updateDaysTogether, 60*1000);

const CLOCK_SIZE = 217;
function positionClocks() {
    document.querySelectorAll(".clock").forEach(clock => {
        const x = parseFloat(clock.dataset.x);
        const y = parseFloat(clock.dataset.y);

        const centerX = x + CLOCK_SIZE / 2;
        const centerY = y + CLOCK_SIZE / 2;

        clock.setAttribute("transform", `translate(${centerX}, ${centerY})`);
    });
}
function getDayNightAngle(timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone, hour: "numeric", minute: "numeric", hour12: false
    }).formatToParts(new Date());

    const hours = parseInt(parts.find(p => p.type === "hour").value);
    const minutes = parseInt(parts.find(p => p.type === "minute").value);

    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes/(24*60)) * 360;
}
function updateClockDayDate(clock, timeZone) {
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
    const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });

    clock.querySelector(".clock-day").textContent = dayFormatter.format(now).toUpperCase();
    clock.querySelector(".clock-date").textContent = dateFormatter.format(now);
}
function updateClocks() {
    document.querySelectorAll(".clock").forEach(clock => {
        const timeZone = clock.dataset.timezone;
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false
        }).formatToParts(now);

        const hours = parseInt(parts.find(p => p.type === "hour").value);
        const minutes = parseInt(parts.find(p => p.type === "minute").value);
        const seconds = parseInt(parts.find(p => p.type === "second").value);

        const hourDeg = (hours % 12) * 30 + minutes * 0.5;
        const minuteDeg = minutes * 6 + seconds * 0.1;
        const secondDeg = seconds * 6;

        clock.querySelector(".clock-hour").style.transform = `rotate(${hourDeg}deg)`;
        clock.querySelector(".clock-minute").style.transform = `rotate(${minuteDeg}deg)`;
        clock.querySelector(".clock-second").style.transform = `rotate(${secondDeg}deg)`;
        clock.querySelector(".clock-daynight-disc").style.transform = `rotate(${getDayNightAngle(timeZone)}deg)`;

        updateClockDayDate(clock, timeZone);
    });
}
positionClocks();
updateClocks();
setInterval(updateClocks, 1000);

interactEls.forEach(el => {
    const ui = document.getElementById(`${el.id}-ui`);
    el.addEventListener("mouseenter", () => {
        main.classList.add("dimming");
        el.classList.add("active");
        if (el.dataset.open) {
            el.setAttribute("href", el.dataset.open);
        }
    });
    el.addEventListener("mouseleave", () => {
        main.classList.remove("dimming");
        el.classList.remove("active");
        if (el.dataset.closed) {
            el.setAttribute("href", el.dataset.closed);
        }
    });
    el.addEventListener("click", () => {
        if (el.id === "stanley") return;

        darken.classList.remove("hide");
        ui.classList.remove("hide");
        backBtn.classList.remove("hide");
        currentUI = ui;
    });
});

backBtn.addEventListener("click", () => {
    if(!currentUI) return;

    if (currentUI.id === "journal-ui") {
        flipbook.turn("page", 1);
    }
    if (currentUI.id === "popper-ui") {
        popperReasonEl.textContent = "reasons why I love you ♡";
        reasonIndex = 0;
        document.querySelectorAll(".popper-tile.popped").forEach(t => t.classList.remove("popped"));
    }

    currentUI.classList.add("hide");
    darken.classList.add("hide");
    backBtn.classList.add("hide");
    currentUI = null;
});
document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && currentUI) backBtn.click();
});

const UI_WIDTH = 1440, UI_HEIGHT = 900;
window.addEventListener("resize", () => {
    const scale = Math.min(window.innerWidth/UI_WIDTH, window.innerHeight/UI_HEIGHT);
    document.querySelectorAll(".ui-canvas").forEach(canvas => {
        if (canvas.closest("#journal-ui")) return;
        canvas.style.transform = `scale(${scale})`;
    });
});

const popperCounts = {
    purple: { count: 2, heightRatio: 1.3595 },
    blue:   { count: 7, heightRatio: 1 },
    green:  { count: 7, heightRatio: 1.01 },
    yellow: { count: 6, heightRatio: 0.9875 },
    orange: { count: 4, heightRatio: 1 },
    red:    { count: 1, heightRatio: 1.4 },
}
const popperGrid = document.querySelector(".popper-grid");
const popSound = new Audio("assets/popper/pop.mp3");
popSound.volume = 0.4;
let popperReasons = [];
let reasonIndex = 0;

Object.entries(popperCounts).forEach(([color, { count, heightRatio }]) => {
    const row = document.createElement("div");
    row.className = "popper-row";
    row.style.setProperty("--row-ratio", heightRatio);

    for (let i = 0; i < count; i++) {
        const tile = document.createElement("div");
        tile.className = "popper-tile";
        tile.dataset.color = color;
        tile.dataset.index = i;

        const tileStd = document.createElement("img");
        tileStd.className = "tile-std";
        tileStd.src = `assets/popper/std/${color}/${i}.png`;

        const tilePop = document.createElement("img");
        tilePop.className = "tile-pop";
        tilePop.src = `assets/popper/pop/${color}/${i}.png`;

        tile.append(tileStd, tilePop);
        row.appendChild(tile);
    }
    popperGrid.appendChild(row);
});

fetch("assets/popper/reasons.txt")
    .then(res => res.text())
    .then(text => popperReasons = text.split("\n").map(line => line.trim()));
const popperReasonEl = document.getElementById("popper-reason");

popperGrid.addEventListener("click", (e) => {
    const tile = e.target.closest(".popper-tile");
    if(!tile || tile.classList.contains("popped")) return;

    tile.classList.add("popped");
    popSound.currentTime = 0;
    popSound.play();
    popperReasonEl.textContent = popperReasons[reasonIndex];
    reasonIndex = (reasonIndex + 1) % popperReasons.length;

    setTimeout(() => {
        tile.classList.remove("popped");
    }, 1500);
});

const videoModal = document.getElementById("video-modal");
const videoPlayer = document.getElementById("video-modal-player");

document.querySelectorAll(".video-trigger").forEach(trigger => {
    trigger.addEventListener("click", async () => {
        const path = trigger.dataset.supabasePath;
        const { data, error } = await supabase.storage
            .from('private-photos')
            .createSignedUrl(path, 60 * 10);
        if (error) { console.error('Could not load protected video:', error); return; }

        videoPlayer.src = data.signedUrl;
        videoModal.classList.remove("hide");
        videoPlayer.play();
    });
});
function closeVideoModal() {
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    videoPlayer.src = "";
    videoModal.classList.add("hide");
}
videoModal.addEventListener("click", (e) => {
    if (e.target === videoModal) closeVideoModal();
});
videoPlayer.addEventListener("ended", closeVideoModal);

const spotifyModal = document.getElementById("spotify-modal");
const spotifyPlayer = document.getElementById("spotify-modal-player");

document.querySelectorAll(".spotify-trigger").forEach(trigger => {
    trigger.addEventListener("click", () => {
        const trackId = trigger.dataset.spotifyTrack;
        spotifyPlayer.src = `https://open.spotify.com/embed/track/${trackId}?autoplay=1`;
        spotifyModal.classList.remove("hide");
    });
});
function closeSpotifyModal() {
    spotifyPlayer.src = "";
    spotifyModal.classList.add("hide");
}
spotifyModal.addEventListener("click", (e) => {
    if (e.target === spotifyModal) closeSpotifyModal();
});

const flipbook = $(".flipbook");
const totalPages = flipbook.children().length;
const FLIPBOOK_WIDTH = 600;
const FLIPBOOK_HEIGHT = 400;

document.documentElement.style.setProperty("--flipbook-width", `${FLIPBOOK_WIDTH}px`);
document.documentElement.style.setProperty("--flipbook-height", `${FLIPBOOK_HEIGHT}px`);

function updateBookCentering() {
    const currentPage = flipbook.turn("page");
    const isFirst = currentPage === 1;
    const isLast = currentPage === totalPages;
    let marginLeft;
    if(isFirst) {
        marginLeft = `-${FLIPBOOK_WIDTH/4}px`;
    } else if(isLast) {
        marginLeft = `${FLIPBOOK_WIDTH/4}px`;
    } else {
        marginLeft = "0px";
    }
    flipbook.css("margin-left", marginLeft);
}
$(".flipbook").turn({
    width: FLIPBOOK_WIDTH,
    height: FLIPBOOK_HEIGHT,
    autocenter: true
}).bind("turned", updateBookCentering);
updateBookCentering();

document.querySelectorAll(".skittle").forEach(skittle => {
    skittle.addEventListener("click", () => {
        const letterId = skittle.dataset.letter;
        document.getElementById(letterId).classList.remove("hide");
    });
});
document.querySelectorAll(".letter-close").forEach(btn => {
    btn.addEventListener("click", () => {
        btn.closest(".letter-modal").classList.add("hide");
    });
});

import { supabase, currentUserLabel } from './auth.js';
const bottleChannel = supabase.channel('bottle-tap');
bottleChannel.subscribe();

function tapBottle() {
    shakeBottle();
    bottleChannel.send({
        type: 'broadcast',
        event: 'tap',
        payload: { from: currentUserLabel },
    });
}

bottleChannel.on('broadcast', { event: 'tap' }, ({ payload }) => {
    shakeBottle(); 

    if(document.hidden) {
        showTapNotification(payload.from);
    }
});

function shakeBottle() {
    const bottle = document.getElementById('stanley');
    bottle.classList.remove('shake');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bottle.classList.add('shake');
        });
    });
}

function showTapNotification(fromLabel) {
    if(Notification.permission !== 'granted') return;
    new Notification('💧 Thinking of you', {
        body: `${fromLabel} tapped the bottle`,
        icon: 'assets/layer-exports/stanley.png',
    });
}

document.getElementById('stanley').addEventListener('click', tapBottle);