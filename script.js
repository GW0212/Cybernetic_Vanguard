(function () {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");
  const coinCountEl = document.getElementById("coinCount");
  const multiplierEl = document.getElementById("multiplier");

  const howToBtn = document.getElementById("howToBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const retryBtn = document.getElementById("retryBtn");

  const difficultyBtn = document.getElementById("difficultyBtn");
  const difficultyMenu = document.getElementById("difficultyMenu");
  const difficultyLabel = document.getElementById("difficultyLabel");

  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");

const mLeft = document.getElementById("mLeft");
const mRight = document.getElementById("mRight");

const howToModal = document.getElementById("howToModal");
const howToClose = document.getElementById("howToClose");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");

const phaseLabel = document.getElementById("phaseLabel");
const comboLabel = document.getElementById("comboLabel");
const soundToggleBtn = document.getElementById("soundToggleBtn");

  // 상단 UI는 키보드 포커스를 타지 않도록 탭 탐색 제거
  [howToBtn, pauseBtn, difficultyBtn, soundToggleBtn].forEach((btn) => {
    if (btn) btn.setAttribute("tabindex", "-1");
  });
  if (!canvas || !ctx) return;

  const GAME_STATE = {
    READY: "ready",
    RUNNING: "running",
    PAUSED: "paused",
    GAMEOVER: "gameover",
  };

  const LANES = 3;
  const PLAYER_BASE_Y_OFFSET = 20;

  const difficultyPresets = {
    easy: { speed: 0.9, maxSpeed: 1.5, obstacleInterval: 1.4 },
    normal: { speed: 1.2, maxSpeed: 2.0, obstacleInterval: 1.1 },
    hard: { speed: 1.6, maxSpeed: 2.6, obstacleInterval: 0.9 },
  };

  let state = GAME_STATE.READY;
  let currentDifficulty = "normal";
  let gameSpeed = difficultyPresets[currentDifficulty].speed;

  let obstacleInterval = difficultyPresets[currentDifficulty].obstacleInterval;
  let coinInterval = obstacleInterval * 0.8;

  let score = 0;
  let scoreValue = 0;
  let distance = 0;
  let baseMultiplier = 1;
  let coinMultiplier = 1;
  let coinCount = 0;

  // 부유 / 대시 연출용 상태
  let floatPhase = 0;
  let dashTrails = [];

  let highScore = Number(localStorage.getItem("obstacleRunner_tron_highScore") || "0");
  highScoreEl.textContent = String(highScore);

  let lastTime = 0;
  let obstacleTimer = 0;
  let coinTimer = 0;

  let playerLane = 1;

  let obstacles = [];
  let coins = [];

// Phase / danger / combo / effects
let phase = 1;
let phaseBannerTime = 0;
let dangerFlashTime = 0;
let comboCount = 0;
let comboTimer = 0;
const COMBO_TIMEOUT = 4;

let shakeTime = 0;
let hitFlashTime = 0;

// Coin collect visual effects
let coinBursts = [];

// Sound system
// === Background Music (music.mp3) ===
const bgm = new Audio("music.mp3");
bgm.loop = true;

function startBGM(reset = false) {
  if (!soundEnabled) return;
  if (reset) {
    try { bgm.currentTime = 0; } catch {}
  }
  bgm.play().catch(() => {});
}

function stopBGM(reset = true) {
  try {
    bgm.pause();
    if (reset) {
      bgm.currentTime = 0;
    }
  } catch {}
}

let soundEnabled = true;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
}

function playTone(freq, duration = 0.12, type = "sine", gainValue = 0.18) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain).connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    osc.start(now);
    osc.stop(now + duration);
  } catch {}
}

function playCoinSound() {
  // softer, more subtle coin sound that sits under the BGM
  // slightly higher pitch, triangle wave, lower gain
  playTone(1200, 0.09, "triangle", 0.08);
}

function playHitSound() {
  playTone(220, 0.18, "sawtooth", 0.25);
}

function playPhaseSound() {
  playTone(660, 0.1, "triangle", 0.18);
}

function playClickSound() {
  playTone(520, 0.06, "sine", 0.12);
}

  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    let width = wrapper ? wrapper.clientWidth : window.innerWidth || 640;
    if (!width || width < 10) {
      width = Math.min(window.innerWidth || 640, 960);
    }
    const height = Math.max(260, Math.round(width * 0.55));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("load", resizeCanvas);
  resizeCanvas();

  function laneToScreenX(lane, t) {
    const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
    const centerX = width / 2;
    const bottomHalfWidth = width * 0.3;
    const topHalfWidth = width * 0.08;
    const halfWidth = topHalfWidth + (bottomHalfWidth - topHalfWidth) * (1 - t);
    const laneNorm = lane - (LANES - 1) / 2;
    return centerX + laneNorm * halfWidth * 0.7;
  }

  function depthToY(t) {
    const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
    const bottomY = height * 0.87;
    const topY = height * 0.25;
    return bottomY - (bottomY - topY) * t;
  }

  function drawTrack() {
    const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const bottomY = height * 0.9;
    const topY = height * 0.23;
    const bottomHalfWidth = width * 0.32;
    const topHalfWidth = width * 0.08;

    ctx.save();
    const grd = ctx.createLinearGradient(0, topY, 0, bottomY);
    grd.addColorStop(0, "#020617");
    grd.addColorStop(1, "#020617");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(width / 2 - topHalfWidth, topY);
    ctx.lineTo(width / 2 + topHalfWidth, topY);
    ctx.lineTo(width / 2 + bottomHalfWidth, bottomY);
    ctx.lineTo(width / 2 - bottomHalfWidth, bottomY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(34,211,238,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - topHalfWidth, topY);
    ctx.lineTo(width / 2 + topHalfWidth, topY);
    ctx.lineTo(width / 2 + bottomHalfWidth, bottomY);
    ctx.lineTo(width / 2 - bottomHalfWidth, bottomY);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = "rgba(45,212,191,0.5)";
    ctx.setLineDash([18, 16]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, topY);
    ctx.lineTo(width / 2, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 사이버 그리드 라인 약간 추가
    ctx.strokeStyle = "rgba(15,118,110,0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const y = depthToY(t);
      const hw = topHalfWidth + (bottomHalfWidth - topHalfWidth) * (1 - t);
      ctx.beginPath();
      ctx.moveTo(width / 2 - hw, y);
      ctx.lineTo(width / 2 + hw, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function getPlayerScreenPos() {
    const t = 0.05;
    const x = laneToScreenX(playerLane, t);
    const yBase = depthToY(t) - PLAYER_BASE_Y_OFFSET;
    return { x, y: yBase };
  }

  
  function drawDashTrails() {
    if (!dashTrails.length) return;
    ctx.save();
    for (const trail of dashTrails) {
      const alpha = Math.max(0, trail.life / trail.maxLife);
      ctx.strokeStyle = `rgba(34,211,238,${0.75 * alpha})`;
      ctx.lineWidth = 3 * alpha;
      ctx.beginPath();
      ctx.moveTo(trail.fromX, trail.y);
      ctx.lineTo(trail.toX, trail.y);
      ctx.stroke();
    }
    ctx.restore();
  }

function drawPlayer() {
    const base = getPlayerScreenPos();
    const floatOffset = Math.sin(floatPhase * 2.0) * 3;
    const pos = { x: base.x, y: base.y + floatOffset };

    ctx.save();

    // 전체 네온 아우라
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 26;

    // === 헤드 유닛만 표현 (몸 없음) ===
    const headW = 42;
    const headH = 20;
    const headTop = pos.y - 40;

    // 헬멧 본체
    const headGrad = ctx.createLinearGradient(pos.x, headTop, pos.x, headTop + headH);
    headGrad.addColorStop(0, "#38bdf8");
    headGrad.addColorStop(0.5, "#0ea5e9");
    headGrad.addColorStop(1, "#082f49");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(pos.x - headW / 2, headTop, headW, headH, 10);
    } else {
      ctx.rect(pos.x - headW / 2, headTop, headW, headH);
    }
    ctx.fill();

    // 사이드 삼각 윙
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(pos.x - headW / 2, headTop + headH / 2 - 4);
    ctx.lineTo(pos.x - headW / 2 - 10, headTop + headH / 2);
    ctx.lineTo(pos.x - headW / 2, headTop + headH / 2 + 4);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pos.x + headW / 2, headTop + headH / 2 - 4);
    ctx.lineTo(pos.x + headW / 2 + 10, headTop + headH / 2);
    ctx.lineTo(pos.x + headW / 2, headTop + headH / 2 + 4);
    ctx.closePath();
    ctx.fill();

    // 전면 바이저
    ctx.fillStyle = "#020617";
    const visorH = 10;
    const visorTop = headTop + (headH - visorH) / 2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(pos.x - 16, visorTop, 32, visorH, 5);
    } else {
      ctx.rect(pos.x - 16, visorTop, 32, visorH);
    }
    ctx.fill();

    // 바이저 안쪽 라인(눈 역할) - 살짝 깜빡이는 두께
    const blink = 0.8 + 0.2 * Math.sin(floatPhase * 3.5);
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1 + blink;
    ctx.beginPath();
    ctx.moveTo(pos.x - 11, visorTop + visorH / 2);
    ctx.lineTo(pos.x + 11, visorTop + visorH / 2);
    ctx.stroke();

    ctx.restore();
  }


function spawnObstacle() {
    // 기본 1개는 항상 생성
    const lanes = [0, 1, 2];
    const type1 = Math.random() < 0.5 ? "small" : "big";
    const lane1 = Math.floor(Math.random() * LANES);
    obstacles.push({ lane: lane1, t: 1, type: type1 });

    // 난이도와 진행도에 따라 2번째 장애물 추가 생성
    let baseChance = 0;
    if (currentDifficulty === "normal") {
      baseChance = 0.35;
    } else if (currentDifficulty === "hard") {
      baseChance = 0.7;
    }
    const progressFactor = Math.min(1, distance / 120); // 멀리 갈수록 더 자주 2개 등장
    const secondObstacleChance = baseChance * (0.3 + 0.7 * progressFactor);

    let spawnedSecond = false;
    if (Math.random() < secondObstacleChance) {
      const availableLanes = lanes.filter((l) => l !== lane1);
      const lane2 = availableLanes[Math.floor(Math.random() * availableLanes.length)];
      const type2 = Math.random() < 0.5 ? "small" : "big";
      obstacles.push({ lane: lane2, t: 1, type: type2 });
      spawnedSecond = true;
    }

    // 하드 난이도에서 2개 이상 동시에 등장 시 경고 연출
    if (currentDifficulty === "hard" && spawnedSecond) {
      dangerFlashTime = 0.5;
    }
  }

function spawnCoin() {
    const lane = Math.floor(Math.random() * LANES);
    coins.push({ lane, t: 1.1, collected: false });
  }

  function updateObjects(dt) {
    const speed = gameSpeed;
    for (const obs of obstacles) {
      obs.t -= dt * speed;
    }
    obstacles = obstacles.filter((obs) => obs.t > -0.2);

    for (const coin of coins) {
      coin.t -= dt * speed;
    }
    coins = coins.filter((c) => c.t > -0.2 && !c.collected);
  }

  function drawObstacles() {
    for (const obs of obstacles) {
      const t = obs.t;
      if (t < 0 || t > 1.1) continue;
      const x = laneToScreenX(obs.lane, t);
      const y = depthToY(t);
      const scale = 1 + (1 - t) * 2.0;
      const baseWidth = obs.type === "small" ? 26 : 34;
      const baseHeight = obs.type === "small" ? 26 : 40;
      const w = baseWidth * scale;
      const h = baseHeight * scale;

      ctx.save();
      const grd = ctx.createLinearGradient(x, y - h, x, y);
      grd.addColorStop(0, "#0ea5e9");
      grd.addColorStop(1, "#0369a1");
      ctx.fillStyle = grd;
      ctx.strokeStyle = "rgba(8,47,73,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x - w / 2, y - h, w, h, 8);
      } else {
        ctx.rect(x - w / 2, y - h, w, h);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCoins() {
    for (const coin of coins) {
      if (coin.collected) continue;
      const t = coin.t;
      if (t < 0 || t > 1.2) continue;
      const x = laneToScreenX(coin.lane, t);
      const y = depthToY(t) - 22;
      const scale = 1 + (1 - t) * 1.6;
      const r = 8 * scale;

      ctx.save();
      const grd = ctx.createRadialGradient(x, y, 2, x, y, r);
      grd.addColorStop(0, "#facc15");
      grd.addColorStop(0.6, "#fde68a");
      grd.addColorStop(1, "#22c55e");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(15,23,42,0.9)";
      ctx.stroke();
      ctx.restore();
    }
  }

  function tryCollectCoins() {
    const pos = getPlayerScreenPos();
    for (const coin of coins) {
      if (coin.collected) continue;
      if (coin.lane !== playerLane) continue;
      if (coin.t > 0.3) continue;

      const t = coin.t;
      const x = laneToScreenX(coin.lane, t);
      const y = depthToY(t) - 22;
      const dx = pos.x - x;
      const dy = (pos.y - 28) - y;
      const distSq = dx * dx + dy * dy;
      const radius = 30;
      if (distSq < radius * radius) {
        coin.collected = true;
        coinCount += 1;
        coinCountEl.textContent = String(coinCount);
        coinMultiplier = 1 + Math.min(2, coinCount * 0.07);
        multiplierEl.textContent = "x" + coinMultiplier.toFixed(1);

        // 콤보 및 비주얼 / 사운드 연출
        comboCount += 1;
        comboTimer = COMBO_TIMEOUT;
        comboLabel.textContent = String(comboCount);
        playCoinSound();

        // 코인 이펙트 (코인 위치에서 HUD 방향으로 날아가는 연출)
        const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
        const targetX = width * 0.2;
        const targetY = height * 0.08;
        coinBursts.push({
          startX: x,
          startY: y,
          endX: targetX,
          endY: targetY,
          age: 0,
          duration: 0.3,
        });
      }
    }
  }

function checkCollisions() {
    // 헤드 유닛 기준 충돌 판정 (조금 관대한 박스)
    const playerT = 0.05;
    const base = getPlayerScreenPos();
    const floatOffset = Math.sin(floatPhase * 2.0) * 3;
    const posY = base.y + floatOffset;

    const headW = 34;
    const headH = 18;
    const headTop = posY - 40;
    const pLeft = base.x - headW / 2;
    const pRight = base.x + headW / 2;
    const pTop = headTop;
    const pBottom = headTop + headH;

    for (const obs of obstacles) {
      if (obs.lane !== playerLane) continue;
      if (Math.abs(obs.t - playerT) > 0.14) continue;

      const t = obs.t;
      const x = laneToScreenX(obs.lane, t);
      const y = depthToY(t);
      const scale = 1 + (1 - t) * 2.0;
      const baseWidth = obs.type === "small" ? 26 : 34;
      const baseHeight = obs.type === "small" ? 26 : 40;
      const w = baseWidth * scale;
      const h = baseHeight * scale;

      const oLeft = x - w / 2;
      const oRight = x + w / 2;
      const oTop = y - h;
      const oBottom = y;

      const overlap =
        pLeft < oRight &&
        pRight > oLeft &&
        pTop < oBottom &&
        pBottom > oTop;

      if (overlap) {
        // 피격 연출
        shakeTime = 0.4;
        hitFlashTime = 0.2;
        comboCount = 0;
        comboLabel.textContent = "0";
        playHitSound();
        gameOver();
        break;
      }
    }
  }

function updateDifficulty(dt) {
  distance += gameSpeed * dt;
  const preset = difficultyPresets[currentDifficulty];
  const factor = Math.min(1, distance / 120);
  gameSpeed = preset.speed + (preset.maxSpeed - preset.speed) * factor;
  obstacleInterval = preset.obstacleInterval - 0.25 * factor;
  coinInterval = Math.max(0.5, obstacleInterval * 0.85);
  baseMultiplier = 1 + factor * 1.5;

  // Phase 계산 (거리 기반)
  let newPhase = 1;
  if (distance > 40 && distance <= 80) {
    newPhase = 2;
  } else if (distance > 80 && distance <= 140) {
    newPhase = 3;
  } else if (distance > 140) {
    newPhase = 4;
  }
  if (newPhase !== phase) {
    phase = newPhase;
    if (phaseLabel) {
      phaseLabel.textContent = String(phase);
    }
    phaseBannerTime = 1.4;
    playPhaseSound();
  }
}

function updateScore(dt) {
  const baseRate = 40;
  const comboBonus = 1 + Math.min(0.5, comboCount * 0.03);
  const gain = dt * baseRate * baseMultiplier * coinMultiplier * comboBonus;
  scoreValue += gain;
  score = Math.floor(scoreValue);
  scoreEl.textContent = String(score);
}

  function setOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

function resetGame() {
  score = 0;
  scoreValue = 0;
  distance = 0;
  baseMultiplier = 1;
  coinMultiplier = 1;
  coinCount = 0;
  obstacles = [];
  coins = [];
  playerLane = 1;
  obstacleTimer = 0;
  coinTimer = 0;
  phase = 1;
  phaseBannerTime = 0;
  dangerFlashTime = 0;
  comboCount = 0;
  comboTimer = 0;
  shakeTime = 0;
  hitFlashTime = 0;
  coinBursts = [];
  scoreEl.textContent = "0";
  coinCountEl.textContent = "0";
  multiplierEl.textContent = "x1.0";
  if (phaseLabel) phaseLabel.textContent = "1";
  if (comboLabel) comboLabel.textContent = "0";
  pauseBtn.textContent = "일시정지 ⏸";
  retryBtn.classList.add("hidden");
}

function applyDifficulty(diff) {
  currentDifficulty = diff;
  const preset = difficultyPresets[diff];
  gameSpeed = preset.speed;
  obstacleInterval = preset.obstacleInterval;
  coinInterval = obstacleInterval * 0.8;
  distance = 0;
  baseMultiplier = 1;
  phase = 1;
  if (phaseLabel) phaseLabel.textContent = "1";
  difficultyLabel.textContent = diff[0].toUpperCase() + diff.slice(1);
}

  function startGame() {
    resetGame();
    hideOverlay();
    state = GAME_STATE.RUNNING;
    startBGM(true);
  }

  function gameOver() {
    if (state === GAME_STATE.GAMEOVER) return;
    state = GAME_STATE.GAMEOVER;
    retryBtn.classList.remove("hidden");
    stopBGM();
    if (score > highScore) {
      highScore = score;
      highScoreEl.textContent = String(highScore);
      localStorage.setItem("obstacleRunner_tron_highScore", String(highScore));
      setOverlay("NEW RECORD!", `점수: ${score} (최고 기록 갱신)`);
    } else {
      setOverlay("GAME OVER", `점수: ${score}`);
    }
  }

  function togglePause() {
    if (state === GAME_STATE.RUNNING) {
      state = GAME_STATE.PAUSED;
      pauseBtn.textContent = "재개 ▶";
      setOverlay("PAUSED", "재개 버튼 또는 P 키로 계속");
    } else if (state === GAME_STATE.PAUSED) {
      state = GAME_STATE.RUNNING;
      pauseBtn.textContent = "일시정지 ⏸";
      hideOverlay();
    }
  }

  function moveLeft() {
    if (state !== GAME_STATE.RUNNING) return;
    if (playerLane <= 0) return;
    const before = getPlayerScreenPos();
    playerLane -= 1;
    const after = getPlayerScreenPos();
    // 레인 이동 시 대시 트레일 추가
    dashTrails.push({
      fromX: before.x,
      toX: after.x,
      y: before.y - 32,
      life: 0.18,
      maxLife: 0.18,
    });
  }

  function moveRight() {
    if (state !== GAME_STATE.RUNNING) return;
    if (playerLane >= LANES - 1) return;
    const before = getPlayerScreenPos();
    playerLane += 1;
    const after = getPlayerScreenPos();
    dashTrails.push({
      fromX: before.x,
      toX: after.x,
      y: before.y - 32,
      life: 0.18,
      maxLife: 0.18,
    });
  }

function update(dt) {
  if (state !== GAME_STATE.RUNNING) return;

  // 부유 애니메이션 단계 진행
  floatPhase += dt * 2.5;

  // 대시 트레일 수명 업데이트
  dashTrails = dashTrails.filter((trail) => {
    trail.life -= dt;
    return trail.life > 0;
  });

  // 콤보 타이머
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      comboTimer = 0;
      comboCount = 0;
      if (comboLabel) comboLabel.textContent = "0";
    }
  }

  obstacleTimer += dt;
  coinTimer += dt;

  if (obstacleTimer >= obstacleInterval) {
    obstacleTimer = 0;
    spawnObstacle();
  }
  if (coinTimer >= coinInterval) {
    coinTimer = 0;
    spawnCoin();
  }

  // 코인 이펙트 업데이트
  coinBursts = coinBursts.filter((b) => {
    b.age += dt;
    return b.age < b.duration;
  });

  updateDifficulty(dt);
  updateScore(dt);
  updateObjects(dt);
  tryCollectCoins();
  checkCollisions();

  // 화면 흔들림 / 경고 타이머 감소
  if (shakeTime > 0) {
    shakeTime -= dt;
    if (shakeTime < 0) shakeTime = 0;
  }
  if (hitFlashTime > 0) {
    hitFlashTime -= dt;
    if (hitFlashTime < 0) hitFlashTime = 0;
  }
  if (dangerFlashTime > 0) {
    dangerFlashTime -= dt;
    if (dangerFlashTime < 0) dangerFlashTime = 0;
  }
  if (phaseBannerTime > 0) {
    phaseBannerTime -= dt;
    if (phaseBannerTime < 0) phaseBannerTime = 0;
  }
}

function drawCoinBursts() {
  if (!coinBursts.length) return;
  const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
  ctx.save();
  for (const b of coinBursts) {
    const t = b.age / b.duration;
    const x = b.startX + (b.endX - b.startX) * t;
    const y = b.startY + (b.endY - b.startY) * t;
    const alpha = 1 - t;
    const r = 6 * (1 - t) + 2;
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(x, y, 1, x, y, r);
    grd.addColorStop(0, "#facc15");
    grd.addColorStop(0.6, "#fde68a");
    grd.addColorStop(1, "#22c55e");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDangerOverlay() {
  if (dangerFlashTime <= 0) return;
  const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
  const alpha = 0.4 * (dangerFlashTime / 0.5);
  ctx.save();
  ctx.strokeStyle = `rgba(248,113,113,${alpha})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, width - 8, height - 8);
  ctx.fillStyle = `rgba(127,29,29,${alpha * 0.35})`;
  ctx.fillRect(0, 0, width, height * 0.18);
  ctx.font = "bold 16px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(254,226,226,${alpha})`;
  ctx.fillText("DANGER", width / 2, height * 0.09);
  ctx.restore();
}

function drawPhaseBanner() {
  if (phaseBannerTime <= 0) return;
  const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
  const t = phaseBannerTime / 1.4;
  const alpha = Math.min(1, t * 1.2);
  ctx.save();
  ctx.font = "bold 18px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(56,189,248,${alpha})`;
  ctx.shadowColor = "rgba(56,189,248,0.9)";
  ctx.shadowBlur = 16;
  ctx.fillText(`PHASE ${phase}`, width / 2, height * 0.22);
  ctx.restore();
}

function render() {
  const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);

  ctx.save();
  if (shakeTime > 0) {
    const intensity = (shakeTime / 0.4);
    const dx = (Math.random() - 0.5) * 12 * intensity;
    const dy = (Math.random() - 0.5) * 10 * intensity;
    ctx.translate(dx, dy);
  }

  drawTrack();
  drawObstacles();
  drawCoins();
  drawDashTrails();
  drawCoinBursts();
  drawPlayer();
  drawPhaseBanner();
  drawDangerOverlay();

  if (hitFlashTime > 0) {
    const alpha = 0.4 * (hitFlashTime / 0.2);
    ctx.fillStyle = `rgba(248,250,252,${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}



function loop(timestamp) {
    const t = timestamp / 1000;
    const dt = lastTime ? Math.min(0.05, t - lastTime) : 0;
    lastTime = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) {
      e.preventDefault();
    }
    switch (e.key) {
      case " ":
      case "ArrowUp":
        if (state === GAME_STATE.READY || state === GAME_STATE.GAMEOVER) startGame();
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        if (state === GAME_STATE.READY) startGame();
        moveLeft();
        break;
      case "ArrowRight":
      case "d":
      case "D":
        if (state === GAME_STATE.READY) startGame();
        moveRight();
        break;
      case "p":
      case "P":
        togglePause();
        break;
    }
  });

  btnLeft.addEventListener("click", () => {
    if (state === GAME_STATE.READY) startGame();
    moveLeft();
  });
  btnRight.addEventListener("click", () => {
    if (state === GAME_STATE.READY) startGame();
    moveRight();
  });

  mLeft.addEventListener("click", () => {
    if (state === GAME_STATE.READY) startGame();
    moveLeft();
  });
  mRight.addEventListener("click", () => {
    if (state === GAME_STATE.READY) startGame();
    moveRight();
  });

  howToBtn.addEventListener("click", () => {
    howToModal.classList.remove("hidden");
  });
  howToClose.addEventListener("click", () => {
    howToModal.classList.add("hidden");
  });
  const backdrop = howToModal.querySelector(".modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      howToModal.classList.add("hidden");
    });
  }

pauseBtn.addEventListener("click", togglePause);
retryBtn.addEventListener("click", () => {
  state = GAME_STATE.READY;
  resetGame();
  hideOverlay();
  setOverlay("READY", "← / → 키 또는 버튼으로 시작\n장애물을 피해 코인을 모아보세요!");
});

if (soundToggleBtn) {
  soundToggleBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? "🔊" : "🔈";
    if (!soundEnabled) {
      try { bgm.pause(); } catch {}
    } else {
      startBGM(false);
    }
    playClickSound();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  });
}

  difficultyBtn.addEventListener("click", () => {
    difficultyMenu.classList.toggle("hidden");
  });

  difficultyMenu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const diff = btn.getAttribute("data-diff");
      applyDifficulty(diff);
      difficultyMenu.classList.add("hidden");
      state = GAME_STATE.READY;
      resetGame();
      setOverlay("READY", `${difficultyLabel.textContent} 난이도 - 시작 대기 중`);
    });
  });

  document.addEventListener("click", (e) => {
    if (!difficultyMenu.classList.contains("hidden")) {
      if (!difficultyBtn.contains(e.target) && !difficultyMenu.contains(e.target)) {
        difficultyMenu.classList.add("hidden");
      }
    }
  });

  applyDifficulty("normal");
  setOverlay("READY", "← / → 키 또는 버튼으로 시작\n장애물을 피해 코인을 모아보세요!");
})();