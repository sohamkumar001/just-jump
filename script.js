/* =========================================
   AUTO-SCALING FOR PERFECT SCREEN FIT
   ========================================= */
function resizeDevice() {
    const device = document.getElementById('retro-device');
    const baseWidth = 390;
    const baseHeight = device.offsetHeight || 650;
    
    const scaleX = window.innerWidth / baseWidth;
    const scaleY = window.innerHeight / baseHeight;
    
    const scale = Math.min(scaleX, scaleY) * 0.96;
    
    device.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', resizeDevice);
setTimeout(resizeDevice, 50);


/* =========================================
   GAME ENGINE & LOGIC (Vanilla JS)
   ========================================= */

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let audioInitialized = false;
function unlockAudioContext() {
    if(!audioInitialized) {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        audioInitialized = true;
        ['touchstart', 'mousedown', 'keydown'].forEach(evt => 
            document.removeEventListener(evt, unlockAudioContext)
        );
    }
}
['touchstart', 'mousedown', 'keydown'].forEach(evt => 
    document.addEventListener(evt, unlockAudioContext, { once: true })
);

function playSound(type) {
    if (audioCtx.state === 'suspended') return; 
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'jump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(600, now + 0.1); 
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'climb') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.setValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.setValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'powerup') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// Turn off smoothing for strict pixel art
ctx.imageSmoothingEnabled = false;

canvas.width = 340;  
canvas.height = 400;

const GRAVITY = 0.6;
const FRICTION = 0.8;
const JUMP_FORCE = -9; 
const MOVE_SPEED = 1.0;
const MAX_SPEED = 4;     
const MAX_PLATFORMS = 25; 
const MAX_LADDERS = 3;

let gameState = 'playing'; 
let camera = { x: 0, y: 0, targetY: 0 };
let score = 0;
let currentDifficulty = 'EASY';

let highScore = 0;
try {
    highScore = localStorage.getItem('pixelClimberRetroHigh') || 0;
} catch (e) {
    console.warn("Local storage blocked.");
}
document.getElementById('high-score-display').innerText = `HI: ${highScore}`;

const keys = { left: false, right: false, up: false, down: false, shoot: false };
const locks = { left: false, right: false, up: false, down: false, upJump: false };

let platforms = [];
let ladders = []; 
let enemies = [];
let bullets = [];
let particles = [];
let clouds = [];
let stars = [];
let ufos = [];
let enemyBullets = [];
let lasers = [];
let shields = [];

let highestPlatformY = canvas.height;

const player = {
    x: 0, 
    y: 0, 
    width: 20,
    height: 20,
    vx: 0,
    vy: 0,
    grounded: false,
    climbing: false,
    crouching: false, 
    facingRight: true,
    cooldown: 0,
    hasShield: false
};

function toggleBtnVisual(id, state) {
    const btn = document.getElementById(id);
    if(btn) {
        if(state) btn.classList.add('active');
        else btn.classList.remove('active');
    }
}

function setKey(key, state) {
    const k = key.toLowerCase();
    if (key === 'ArrowLeft' || k === 'a') { keys.left = state; toggleBtnVisual('btn-left', state); }
    if (key === 'ArrowRight' || k === 'd') { keys.right = state; toggleBtnVisual('btn-right', state); }
    
    if (key === 'ArrowUp' || k === 'w' || key === ' ') { keys.up = state; toggleBtnVisual('btn-up', state); }
    if (key === 'ArrowDown' || k === 's') { keys.down = state; toggleBtnVisual('btn-down', state); }
    
    if (k === 'f' || key === 'Enter') { keys.shoot = state; toggleBtnVisual('btn-shoot', state); }
}

window.addEventListener('keydown', e => {
    if([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    setKey(e.key, true);
}, { passive: false });

window.addEventListener('keyup', e => setKey(e.key, false));

/* =========================================
   FIXED TOUCH & MOUSE CONTROLS
   ========================================= */
function setupButton(btnId, keyMapStr) {
    const btn = document.getElementById(btnId);
    if(!btn) return;

    const press = (e) => {
        if (e.cancelable) e.preventDefault();
        keys[keyMapStr] = true;
        btn.classList.add('active');
    };

    const release = (e) => {
        if (e.cancelable) e.preventDefault();
        keys[keyMapStr] = false;
        btn.classList.remove('active');
    };

    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false }); 

    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
}

setupButton('btn-up', 'up');
setupButton('btn-down', 'down');
setupButton('btn-left', 'left');
setupButton('btn-right', 'right');
setupButton('btn-shoot', 'shoot');


function initCloudsAndStars() {
    clouds = [];
    stars = [];
    for(let i=0; i<6; i++) {
        clouds.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, speed: 0.1 + Math.random()*0.2, size: 1 + Math.floor(Math.random()*2) });
    }
    for(let i=0; i<100; i++) {
        stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() > 0.8 ? 2 : 1 });
    }
}

// Map generation relies on depth (highestPlatformY) for difficulty
function spawnPlatform(startY) {
    let diffY = Math.abs(startY);
    let diffObj = { level: 'easy', gapBase: 40, widths: [60, 80, 100], isSpace: false };
    
    if (diffY > 4000) {
        diffObj = { level: 'hard', gapBase: 65, widths: [40, 50, 60], isSpace: true };
        currentDifficulty = 'HARD';
    } else if (diffY > 1500) {
        diffObj = { level: 'medium', gapBase: 50, widths: [50, 60, 80], isSpace: true };
        currentDifficulty = 'MEDIUM';
    } else {
        currentDifficulty = 'EASY';
    }

    // Update UI Phase
    document.getElementById('difficulty-display').innerText = `PHASE: ${currentDifficulty}`;

    // Chance to create a ladder gap increases with difficulty
    let ladderChance = diffObj.level === 'hard' ? 0.25 : (diffObj.level === 'medium' ? 0.15 : 0.05);
    const isLargeGap = (platforms.length > 0 && Math.random() < ladderChance);
    const gap = isLargeGap ? (95 + Math.random() * 30) : (diffObj.gapBase + Math.random() * 20); 
    const y = startY - gap;

    let numPlatforms = 1;
    // Less chance for double platforms on hard mode
    let doubleChance = diffObj.level === 'hard' ? 0.3 : 0.6;
    if (!isLargeGap && Math.random() > doubleChance && platforms.length > 2) {
        numPlatforms = 2;
    }

    let spawnedPlatforms = [];
    for (let i = 0; i < numPlatforms; i++) {
        const width = diffObj.widths[Math.floor(Math.random() * diffObj.widths.length)];
        
        let x;
        if (numPlatforms === 2) {
            if (i === 0) x = Math.random() * (canvas.width / 2 - width);
            else x = canvas.width / 2 + Math.random() * (canvas.width / 2 - width);
        } else {
            if (platforms.length === 0) x = canvas.width / 2 - width / 2;
            else {
                let lastPlatform = platforms[platforms.length - 1];
                if (isLargeGap) {
                    let minX = Math.max(0, lastPlatform.x - width + 24);
                    let maxX = Math.min(canvas.width - width, lastPlatform.x + lastPlatform.width - 24);
                    if (maxX < minX) {
                        x = lastPlatform.x + lastPlatform.width/2 - width/2; 
                        x = Math.max(0, Math.min(canvas.width - width, x));
                    } else {
                        x = minX + Math.random() * (maxX - minX);
                    }
                } else {
                    const maxJumpDist = diffObj.level === 'hard' ? 120 : 140;
                    const minX = Math.max(0, lastPlatform.x - maxJumpDist);
                    const maxX = Math.min(canvas.width - width, lastPlatform.x + maxJumpDist);
                    x = minX + Math.random() * (maxX - minX);
                }
            }
        }

        const platform = { x, y, width, height: 12, type: 'normal', decor: [], hasObstacle: false };
        
        if (!diffObj.isSpace) {
            if(Math.random() > 0.5) platform.decor.push({ type: 'bush', x: x + Math.random() * (width - 16) });
        }
        spawnedPlatforms.push(platform);
    }
    
    spawnedPlatforms.forEach(p => platforms.push(p));

    // Force ladder for large gaps
    if (isLargeGap && ladders.length < MAX_LADDERS) {
        let topP = spawnedPlatforms[0];
        let bottomP = platforms[platforms.length - spawnedPlatforms.length - 1];
        
        let overlapLeft = Math.max(topP.x, bottomP.x);
        let overlapRight = Math.min(topP.x + topP.width, bottomP.x + bottomP.width);
        
        let ladderX = overlapLeft + (overlapRight - overlapLeft) / 2 - 12;
        if (overlapRight < overlapLeft) ladderX = topP.x + topP.width/2 - 12; 

        let ladderHeight = bottomP.y - topP.y;
        ladders.push({ x: ladderX, y: topP.y, width: 24, height: ladderHeight });
        topP.hasObstacle = true;
    }

    // Allocate Enemies / Obstacles based on Difficulty
    spawnedPlatforms.forEach(p => {
        if (p.hasObstacle) return; 
        
        // Hard Phase: Space Lasers
        if (diffObj.level === 'hard' && Math.random() < 0.25) {
            lasers.push({
                y: p.y - 15, 
                state: 'warning',
                warningTimer: 70, // Faster laser active time
                activeTimer: 60,
                triggered: false
            });
            p.hasObstacle = true;
        }
        // Medium & Hard Phase: UFOs (Aliens)
        else if (diffObj.level !== 'easy' && Math.random() < (diffObj.level === 'hard' ? 0.35 : 0.2) && ufos.length < (diffObj.level === 'hard' ? 3 : 2)) {
            ufos.push({
                x: Math.random() > 0.5 ? -30 : canvas.width,
                y: p.y - 60 - Math.random() * 40, 
                width: 24, height: 14,
                vx: (Math.random() > 0.5 ? 1 : -1) * (diffObj.level === 'hard' ? 1.8 : 1.2),
                cooldown: (diffObj.level === 'hard' ? 50 : 80) + Math.random() * 40
            });
            p.hasObstacle = true;

            // --- ALIEN SPAWN TRIGGER: SHIELD SPAWN LOGIC ---
            // When an alien spawns, there is a chance to spawn a shield on this platform
            if (Math.random() < 0.4) {
                shields.push({
                    x: p.x + p.width/2 - 8,
                    y: p.y - 20,
                    width: 16, height: 16,
                    animOffset: Math.random() * Math.PI * 2
                });
            }
        }
        // All Phases: Ground Enemies
        else if (p.width >= 50 && Math.random() < (diffObj.level === 'hard' ? 0.5 : (diffObj.level === 'medium' ? 0.4 : 0.2)) && enemies.length < 4) {
            let enemySpeed = diffObj.level === 'easy' ? 0.8 : (diffObj.level === 'medium' ? 1.2 : 1.8);
            enemies.push({ 
                x: p.x + p.width/2 - 8, y: p.y - 16, 
                width: 16, height: 16, 
                vx: (Math.random() > 0.5 ? 1 : -1) * enemySpeed,
                boundL: p.x, boundR: p.x + p.width 
            });
            p.hasObstacle = true;
        } 
    });

    highestPlatformY = y;
}

function spawnParticles(x, y, color, count) {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
            life: 15 + Math.random() * 15, maxLife: 30,
            color: color, size: Math.random() > 0.5 ? 4 : 2 
        });
    }
}

// Helper to absorb damage with shield
function takeDamage() {
    if (player.hasShield) {
        player.hasShield = false;
        // Cyan shield breaking effect
        spawnParticles(player.x + player.width/2, player.y + player.height/2, '#06b6d4', 25);
        playSound('hit');
        return true; // Survived
    }
    triggerGameOver();
    return false; // Died
}

function update() {
    if (gameState !== 'playing') return;

    // LADDER CHECK
    let touchingLadder = false;
    let activeLadder = null;
    for (let l of ladders) {
        if (player.x + player.width/2 > l.x && player.x + player.width/2 < l.x + l.width &&
            player.y + player.height > l.y && player.y < l.y + l.height) {
            touchingLadder = true;
            activeLadder = l;
        }
    }

    // Attach to ladder
    if (touchingLadder) {
        if (!player.climbing && (keys.up || keys.down)) {
            player.climbing = true;
            player.crouching = false;
            player.x = activeLadder.x + activeLadder.width/2 - player.width/2;
            player.vx = 0;
            player.vy = 0;
            locks.up = keys.up;
            locks.down = keys.down; 
        }
    } else {
        player.climbing = false;
    }

    // STATE UPDATES
    if (player.climbing) {
        player.vx = 0;
        player.vy = 0;

        if (keys.up && !locks.up) {
            player.y -= 14; 
            locks.up = true;
            playSound('climb');
        }
        if (!keys.up) { locks.up = false; locks.upJump = false; }

        if (keys.down && !locks.down) {
            player.y += 14;
            locks.down = true;
            playSound('climb');
        }
        if (!keys.down) locks.down = false;

        if (keys.left || keys.right) {
            player.climbing = false;
            player.vx = keys.left ? -MOVE_SPEED : MOVE_SPEED;
        }

    } else {
        // NORMAL MOVEMENT & CROUCHING
        if (keys.down && player.grounded) {
            player.crouching = true;
        } else {
            player.crouching = false;
        }

        if (!player.crouching) {
            if (keys.left) { 
                if (!locks.left) { player.vx -= 2; locks.left = true; }
                player.vx -= MOVE_SPEED; 
                player.facingRight = false; 
            } else { locks.left = false; }
            
            if (keys.right) { 
                if (!locks.right) { player.vx += 2; locks.right = true; }
                player.vx += MOVE_SPEED; 
                player.facingRight = true; 
            } else { locks.right = false; }
        }

        player.vx *= FRICTION;
        player.vy += GRAVITY;

        if (player.vx > MAX_SPEED) player.vx = MAX_SPEED;
        if (player.vx < -MAX_SPEED) player.vx = -MAX_SPEED;

        // Screen Wrap
        if (player.x > canvas.width) player.x = -player.width;
        if (player.x < -player.width) player.x = canvas.width;

        // Jumping
        if (keys.up && player.grounded && !locks.upJump) {
            player.vy = JUMP_FORCE;
            player.grounded = false;
            player.crouching = false; 
            playSound('jump');
            locks.upJump = true;
            locks.up = true; 
        }
        if (!keys.up) { 
            locks.upJump = false; 
            locks.up = false; 
        }
    }

    player.x += player.vx;
    if(!player.climbing) player.y += player.vy;

    // Player Shooting 
    if (keys.shoot && player.cooldown <= 0) {
        let bVx = player.facingRight ? 10 : -10;
        let bX = player.facingRight ? player.x + player.width : player.x - 8;
        let bY = player.crouching ? player.y + 12 : player.y + 6;
        bullets.push({ x: bX, y: bY, vx: bVx, vy: 0, width: 6, height: 6 });
        player.cooldown = 15; 
        playSound('shoot');
    }
    if (player.cooldown > 0) player.cooldown--;

    player.grounded = false;

    // Platform Collisions
    if (!player.climbing) {
        for (let p of platforms) {
            if (player.vy > 0 && 
                player.x + player.width > p.x && 
                player.x < p.x + p.width &&
                player.y + player.height >= p.y &&
                player.y + player.height - player.vy <= p.y + 12) 
            {
                player.y = p.y - player.height;
                player.vy = 0;
                player.grounded = true;
            }
        }
    }

    // Dynamic hitbox
    let pHitBox = {
        x: player.x,
        y: player.crouching ? player.y + 10 : player.y,
        width: player.width,
        height: player.crouching ? 10 : player.height
    };

    // Bullets (Player)
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        if (b.x < 0 || b.x > canvas.width || b.y < camera.y - 100 || b.y > camera.y + canvas.height) bullets.splice(i, 1);
    }

    // Shields (Collectibles)
    for (let i = shields.length - 1; i >= 0; i--) {
        let s = shields[i];
        s.animOffset += 0.1;
        let drawY = s.y + Math.sin(s.animOffset) * 4;

        if (pHitBox.x < s.x + s.width && pHitBox.x + pHitBox.width > s.x &&
            pHitBox.y < drawY + s.height && pHitBox.y + pHitBox.height > drawY) {
            player.hasShield = true;
            score += 50;
            playSound('powerup');
            shields.splice(i, 1);
        }
    }

    // Space Lasers Logic
    for (let i = lasers.length - 1; i >= 0; i--) {
        let l = lasers[i];
        if (!l.triggered && l.y > camera.y && l.y < camera.y + canvas.height) {
            l.triggered = true;
        }

        if (l.triggered) {
            if (l.state === 'warning') {
                l.warningTimer--;
                if (l.warningTimer <= 0) {
                    l.state = 'active';
                    playSound('laser');
                }
            } else if (l.state === 'active') {
                l.activeTimer--;
                if (l.activeTimer <= 0) {
                    lasers.splice(i, 1);
                    continue;
                }
                // Laser collision check
                if (pHitBox.y < l.y + 4 && pHitBox.y + pHitBox.height > l.y) {
                    if (takeDamage()) {
                        // Destroy laser beam if shielded
                        lasers.splice(i, 1);
                    }
                }
            }
        }
    }

    // UFOs
    for (let i = ufos.length - 1; i >= 0; i--) {
        let u = ufos[i];
        u.x += u.vx;
        if (u.x < -40) u.x = canvas.width + 10;
        if (u.x > canvas.width + 40) u.x = -40;

        u.cooldown--;
        if (u.cooldown <= 0 && Math.abs(player.x - u.x) < 100) {
            enemyBullets.push({ x: u.x + u.width/2 - 2, y: u.y + u.height, vx: 0, vy: 4.5, width: 4, height: 10 });
            u.cooldown = (currentDifficulty === 'HARD' ? 50 : 80) + Math.random() * 50;
        }

        let shotDown = false;
        for (let j = bullets.length - 1; j >= 0; j--) {
            let b = bullets[j];
            if (b.x < u.x + u.width && b.x + b.width > u.x && b.y < u.y + u.height && b.y + b.height > u.y) {
                spawnParticles(u.x + u.width/2, u.y + u.height/2, '#10b981', 15);
                playSound('hit');
                bullets.splice(j, 1);
                ufos.splice(i, 1);
                score += 100; 
                shotDown = true;
                break;
            }
        }
        if (shotDown) continue;
        
        // UFO collision with player
        if (pHitBox.x < u.x + u.width && pHitBox.x + pHitBox.width > u.x && pHitBox.y < u.y + u.height && pHitBox.y + pHitBox.height > u.y) {
            if (takeDamage()) {
                spawnParticles(u.x + u.width/2, u.y + u.height/2, '#10b981', 15);
                ufos.splice(i, 1);
            }
        }
    }

    // Enemy Bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i];
        eb.y += eb.vy;
        if (eb.y > camera.y + canvas.height) {
            enemyBullets.splice(i, 1);
            continue;
        }
        if (pHitBox.x < eb.x + eb.width && pHitBox.x + pHitBox.width > eb.x && pHitBox.y < eb.y + eb.height && pHitBox.y + pHitBox.height > eb.y) {
            if (takeDamage()) {
                enemyBullets.splice(i, 1);
            }
        }
    }

    // Ground Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        e.x += e.vx;
        if(e.x < e.boundL || e.x + e.width > e.boundR) e.vx *= -1;

        let shotDown = false;
        for (let j = bullets.length - 1; j >= 0; j--) {
            let b = bullets[j];
            if (b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
                spawnParticles(e.x + e.width/2, e.y + e.height/2, '#ef4444', 10);
                playSound('hit');
                bullets.splice(j, 1);
                enemies.splice(i, 1);
                score += 50;
                shotDown = true;
                break;
            }
        }
        if (shotDown) continue;

        // Ground Enemy collision with player
        if (pHitBox.x < e.x + e.width && pHitBox.x + pHitBox.width > e.x && pHitBox.y < e.y + e.height && pHitBox.y + pHitBox.height > e.y) {
            if (takeDamage()) {
                spawnParticles(e.x + e.width/2, e.y + e.height/2, '#ef4444', 10);
                enemies.splice(i, 1);
            }
        }
    }

    // Particles
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
    particles = particles.filter(p => p.life > 0);

    // Camera
    camera.targetY = player.y - canvas.height / 2 + 50; 
    camera.y += (camera.targetY - camera.y) * 0.1; 
    if (camera.y > 0) camera.y = 0; 

    // Cleanup offscreen objects
    const cleanupThreshold = camera.y + canvas.height + 100;
    platforms = platforms.filter(p => p.y < cleanupThreshold);
    ladders = ladders.filter(l => l.y < cleanupThreshold);
    enemies = enemies.filter(e => e.y < cleanupThreshold);
    ufos = ufos.filter(u => u.y < cleanupThreshold);
    lasers = lasers.filter(l => l.y < cleanupThreshold);
    shields = shields.filter(s => s.y < cleanupThreshold);

    // Spawn New Map
    while (platforms.length < MAX_PLATFORMS) {
        spawnPlatform(highestPlatformY);
        score += 10;
    }

    document.getElementById('score-display').innerText = `SCORE: ${score}`;

    if (player.y > camera.y + canvas.height) triggerGameOver();
}

// DRAWING HELPERS FOR PIXEL ART STYLE
function drawPixelRect(ctx, x, y, w, h, size) {
    for (let i = 0; i < w; i += size) {
        for (let j = 0; j < h; j += size) {
            ctx.fillRect(x + i, y + j, size, size);
        }
    }
}

function draw() {
    // Sky transitions based on depth
    let spaceProgress = Math.min(1, Math.max(0, -camera.y / 4000));
    
    ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(spaceProgress < 1) {
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, canvas.height*0.2, canvas.width, canvas.height);
        ctx.fillStyle = '#60a5fa'; ctx.fillRect(0, canvas.height*0.6, canvas.width, canvas.height);
    }
    
    if (spaceProgress > 0) {
        ctx.fillStyle = '#0f172a';
        ctx.globalAlpha = spaceProgress;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
        
        ctx.fillStyle = 'white';
        stars.forEach(s => {
            let sy = (s.y - camera.y * 0.05) % canvas.height;
            if (sy < 0) sy += canvas.height;
            // Draw blocky stars
            ctx.fillRect(s.x, sy, s.size * 2, s.size * 2);
        });
    }

    ctx.save();
    ctx.translate(0, -camera.y);

    if (spaceProgress < 1) {
        ctx.fillStyle = 'white';
        clouds.forEach(c => {
            c.x += c.speed;
            if(c.x > canvas.width + 50) c.x = -50;
            const cy = c.y - (camera.y * 0.1); 
            // Chunky Pixel Clouds
            let s = c.size * 2;
            ctx.fillRect(c.x, cy, 30*s, 10*s);
            ctx.fillRect(c.x + 5*s, cy - 5*s, 20*s, 5*s);
            ctx.fillRect(c.x - 5*s, cy + 10*s, 40*s, 5*s);
        });
    }
    
    // Ladders (Pixel look)
    ladders.forEach(l => {
        ctx.fillStyle = '#78350f'; 
        ctx.fillRect(l.x, l.y, 4, l.height);
        ctx.fillRect(l.x + l.width - 4, l.y, 4, l.height);
        ctx.fillStyle = '#d97706'; 
        for (let r = l.y + 8; r < l.y + l.height; r += 12) {
            ctx.fillRect(l.x + 4, r, l.width - 8, 4);
        }
    });

    // Platforms
    platforms.forEach(p => {
        // Pixel Decor (Bushes)
        p.decor.forEach(d => {
            if(d.type === 'bush') {
                ctx.fillStyle = '#166534';
                ctx.fillRect(d.x, p.y-8, 16, 8);
                ctx.fillRect(d.x+4, p.y-12, 8, 4);
                ctx.fillStyle = '#15803d'; // Highlight
                ctx.fillRect(d.x+2, p.y-10, 4, 4);
                ctx.fillRect(d.x+10, p.y-6, 4, 4);
            }
        });
        
        if (p.y < -1500) {
            // Space Platform (Grey Metal)
            ctx.fillStyle = '#475569'; 
            ctx.fillRect(p.x, p.y, p.width, p.height);
            ctx.fillStyle = '#94a3b8'; 
            ctx.fillRect(p.x, p.y, p.width, 4);
            // Rivets
            ctx.fillStyle = '#334155';
            for (let i = 4; i < p.width - 4; i+= 12) ctx.fillRect(p.x + i, p.y + 6, 2, 2);
        } else {
            // Ground Platform (Dirt/Grass)
            ctx.fillStyle = '#78350f'; 
            ctx.fillRect(p.x, p.y, p.width, p.height);
            ctx.fillStyle = '#22c55e'; 
            ctx.fillRect(p.x, p.y, p.width, 4);
            // Dirt pattern
            ctx.fillStyle = '#451a03';
            for (let i = 2; i < p.width - 2; i+= 8) {
                if (i%16 === 0) ctx.fillRect(p.x + i, p.y + 6, 4, 4);
                else ctx.fillRect(p.x + i, p.y + 8, 2, 2);
            }
        }
    });

    // Shields (Power-ups)
    shields.forEach(s => {
        let drawY = s.y + Math.sin(s.animOffset) * 4;
        ctx.fillStyle = '#06b6d4'; // Cyan base
        ctx.fillRect(s.x + 4, drawY, 8, 16);
        ctx.fillRect(s.x, drawY + 4, 16, 8);
        ctx.fillStyle = '#67e8f9'; // Bright core
        ctx.fillRect(s.x + 4, drawY + 4, 8, 8);
        ctx.fillStyle = '#ffffff'; // Shine
        ctx.fillRect(s.x + 6, drawY + 6, 4, 4);
    });

    // Space Lasers Visuals
    lasers.forEach(l => {
        if (l.state === 'warning' && l.triggered) {
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + Math.abs(Math.sin(Date.now() / 100)) * 0.6})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 12]);
            ctx.beginPath();
            ctx.moveTo(0, l.y + 2);
            ctx.lineTo(canvas.width, l.y + 2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (l.state === 'active') {
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(0, l.y, canvas.width, 4);
            ctx.fillStyle = '#fca5a5';
            ctx.fillRect(0, l.y + 1, canvas.width, 2);
        }
    });

    // Enemies (Pixel Slimes/Bots)
    enemies.forEach(e => {
        ctx.fillStyle = '#991b1b'; // Dark Outline
        ctx.fillRect(e.x-1, e.y-1, e.width+2, e.height+2);
        ctx.fillStyle = '#ef4444'; // Red body
        ctx.fillRect(e.x, e.y, e.width, e.height);
        
        // Pixel eyes
        ctx.fillStyle = 'white';
        let look = e.vx > 0 ? 8 : 2;
        ctx.fillRect(e.x + look, e.y + 4, 4, 4);
        ctx.fillRect(e.x + look + 6, e.y + 4, 4, 4);
        ctx.fillStyle = 'black'; 
        ctx.fillRect(e.x + look + (e.vx>0?2:0), e.y + 6, 2, 2);
        ctx.fillRect(e.x + look + 6 + (e.vx>0?2:0), e.y + 6, 2, 2);
    });

    // UFOs (Aliens)
    ufos.forEach(u => {
        // Glass dome
        ctx.fillStyle = '#10b981'; 
        ctx.fillRect(u.x + 6, u.y, u.width - 12, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(u.x + 8, u.y + 2, 4, 2); // Glass glare
        
        // Metal base
        ctx.fillStyle = '#cbd5e1'; 
        ctx.fillRect(u.x, u.y + 6, u.width, 8);
        ctx.fillStyle = '#64748b'; // Underbelly shadow
        ctx.fillRect(u.x + 2, u.y + 12, u.width - 4, 2);

        // Blinking lights
        let flash = Math.floor(Date.now() / 150) % 2 === 0;
        ctx.fillStyle = flash ? '#ef4444' : '#f59e0b';
        ctx.fillRect(u.x + 2, u.y + 8, 4, 4);
        ctx.fillRect(u.x + u.width - 6, u.y + 8, 4, 4);
    });
    
    // Player Bullets
    ctx.fillStyle = '#fef08a';
    bullets.forEach(b => {
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x + (b.vx>0?2:0), b.y+2, 2, 2);
        ctx.fillStyle = '#fef08a';
    });

    // Enemy Bullets
    ctx.fillStyle = '#ef4444';
    enemyBullets.forEach(eb => {
        ctx.fillRect(eb.x, eb.y, eb.width, eb.height);
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(eb.x+1, eb.y+1, eb.width-2, eb.height-2);
        ctx.fillStyle = '#ef4444';
    });

    // Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    // --- DRAW PLAYER WITH CROUCH LOGIC (Pixel Art Setup) ---
    let drawY = player.crouching ? player.y + 10 : player.y;
    let drawH = player.crouching ? 10 : player.height;

    // Shield Aura
    if (player.hasShield) {
        ctx.strokeStyle = '#06b6d4'; // Cyan aura
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        let offsetTimer = (Date.now() / 100) % 6;
        ctx.lineDashOffset = -offsetTimer;
        ctx.strokeRect(player.x - 4, drawY - 4, player.width + 8, drawH + 8);
        ctx.setLineDash([]);
    }

    // Space Suit Main Body
    ctx.fillStyle = '#0284c7'; // Darker blue outline/shadow
    ctx.fillRect(player.x - 1, drawY - 1, player.width + 2, drawH + 2);

    ctx.fillStyle = '#38bdf8'; // Base suit
    ctx.fillRect(player.x, drawY, player.width, drawH);
    
    // Backpack
    if (!player.climbing) {
        ctx.fillStyle = '#bae6fd';
        if (player.facingRight) ctx.fillRect(player.x - 4, drawY + 4, 4, drawH - 8);
        else ctx.fillRect(player.x + player.width, drawY + 4, 4, drawH - 8);
    }

    // Space Helmet / Visor
    ctx.fillStyle = '#ffffff'; // White helmet
    if (player.climbing) {
        ctx.fillRect(player.x + 2, drawY + 2, player.width - 4, 8);
    } else {
        let hX = player.facingRight ? player.x + 4 : player.x;
        ctx.fillRect(hX, drawY, player.width - 4, 10);
        
        // Visor Black glass
        ctx.fillStyle = '#0f172a';
        let vX = player.facingRight ? player.x + 10 : player.x;
        ctx.fillRect(vX, drawY + 2, 10, 6);
        
        // Visor glare
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(vX + (player.facingRight ? 6 : 2), drawY + 2, 2, 2);
    }

    // Legs / Feet
    ctx.fillStyle = '#0369a1'; 
    ctx.fillRect(player.x + 2, drawY + drawH - 4, 6, 4);
    ctx.fillRect(player.x + player.width - 8, drawY + drawH - 4, 6, 4);

    ctx.restore();
}

function triggerGameOver() {
    gameState = 'gameover';
    document.getElementById('game-over-screen').style.display = 'flex';
    if(score > highScore) {
        highScore = score;
        try { localStorage.setItem('pixelClimberRetroHigh', highScore); } catch(e){}
        document.getElementById('high-score-display').innerText = `HI: ${highScore}`;
    }
}

function resetGame() {
    platforms = []; ladders = []; enemies = [];
    bullets = []; particles = []; ufos = []; enemyBullets = []; lasers = []; shields = [];
    score = 0; 

    platforms.push({ x: 0, y: canvas.height - 20, width: canvas.width, height: 20, type: 'ground', decor: [] });
    player.x = canvas.width / 2 - 10;
    player.y = canvas.height - 20 - player.height; 
    player.vx = 0; player.vy = 0;
    player.grounded = true; player.climbing = false; player.crouching = false;
    player.hasShield = false;
    
    camera.y = 0;
    highestPlatformY = canvas.height - 20;

    for(let i=0; i<MAX_PLATFORMS; i++) spawnPlatform(highestPlatformY);

    document.getElementById('game-over-screen').style.display = 'none';
    gameState = 'playing';
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

initCloudsAndStars();
resetGame();
gameLoop();
