(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const $ = (id) => document.getElementById(id);

  const ui = {
    healthText: $("healthText"),
    healthBar: $("healthBar"),
    energyText: $("energyText"),
    energyBar: $("energyBar"),
    roomText: $("roomText"),
    coinText: $("coinText"),
    hakiText: $("hakiText"),
    toast: $("toast"),
    restartBtn: $("restartBtn"),
    damageBtn: $("damageBtn"),
    healthBtn: $("healthBtn"),
    energyBtn: $("energyBtn"),
    upgradeMessage: $("upgradeMessage")
  };

  const W = canvas.width;
  const H = canvas.height;
  const TAU = Math.PI * 2;

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false };

  let player;
  let enemies = [];
  let projectiles = [];
  let effects = [];
  let portal = null;
  let room = 1;
  let coins = 0;
  let damageLevel = 0;
  let healthLevel = 0;
  let energyLevel = 0;
  let haki = false;
  let clear = false;
  let gameOver = false;
  let lastTime = 0;
  let toastTimer = 0;
  let attackCooldown = 0;
  let nextEnemyId = 1;

  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  function notify(message, duration = 2.1) {
    ui.toast.textContent = message;
    toastTimer = duration;
    ui.toast.style.opacity = "1";
  }

  function makePlayer() {
    return {
      x: W / 2,
      y: H / 2,
      r: 15,
      speed: 225,
      hp: 100 + healthLevel * 20,
      maxHp: 100 + healthLevel * 20,
      energy: 100,
      maxEnergy: 100,
      invulnerable: 0,
      hakiTime: 0,
      fistCd: 0,
      homingCd: 0,
      freezeCd: 0,
      slamCd: 0,
      portalCd: 0,
      slashAnim: 0
    };
  }

  function spawnEnemy(type, x, y) {
    const boss = type === "boss";
    const brute = type === "brute";
    const fast = type === "fast";

    const hp = boss
      ? 420 + room * 65
      : brute
        ? 95 + room * 12
        : fast
          ? 38 + room * 6
          : 48 + room * 8;

    enemies.push({
      id: nextEnemyId++,
      type,
      x,
      y,
      r: boss ? 31 : brute ? 20 : 14,
      hp,
      maxHp: hp,
      speed: boss ? 65 + room * 1.5 : brute ? 48 + room * 2 : fast ? 105 + room * 2 : 68 + room * 2,
      damage: boss ? 22 : brute ? 15 : fast ? 8 : 10,
      hitCd: rand(0, 0.5),
      slow: 0,
      frozen: 0,
      flash: 0,
      phase: rand(0, TAU),
      boss,
      alive: true
    });
  }

  function spawnRoom() {
    enemies = [];
    projectiles = [];
    effects = [];
    portal = null;
    clear = false;
    gameOver = false;

    player.x = W / 2;
    player.y = H / 2;
    player.hp = Math.min(player.maxHp, player.hp + 18);
    player.energy = Math.min(player.maxEnergy, player.energy + 25);
    player.invulnerable = 1.2;

    const count = Math.min(4 + room * 2, 20);

    if (room % 5 === 0) {
      spawnEnemy("boss", 100, 100);
      for (let i = 0; i < Math.min(2 + Math.floor(room / 5), 5); i++) {
        spawnEnemy(i % 2 ? "fast" : "normal", rand(80, W - 80), rand(70, H - 70));
      }
      notify(`ROOM ${room} — BOSS RAMPAGE!`, 3);
    } else {
      for (let i = 0; i < count; i++) {
        let type = "normal";
        const roll = Math.random();
        if (room >= 3 && roll < 0.23) type = "fast";
        else if (room >= 2 && roll < 0.42) type = "brute";

        let x, y;
        do {
          x = rand(35, W - 35);
          y = rand(35, H - 35);
        } while (Math.hypot(x - player.x, y - player.y) < 140);

        spawnEnemy(type, x, y);
      }
      notify(`ROOM ${room} — ${count} ENEMIES`, 2);
    }

    updateUI();
  }

  function startPortal() {
    if (clear || gameOver) return;
    clear = true;
    enemies = [];
    projectiles = [];

    let x = W / 2;
    let y = H / 2;

    if (Math.hypot(player.x - x, player.y - y) < 100) {
      x = player.x < W / 2 ? W - 65 : 65;
      y = player.y < H / 2 ? H - 65 : 65;
    }

    portal = { x, y, r: 25, phase: 0 };
    const reward = room % 5 === 0 ? 12 : 4;
    coins += reward;
    notify(`ROOM CLEARED! +${reward} MOCHI COINS — ENTER THE PORTAL`, 4);
    updateUI();
  }

  function enterPortal() {
    room++;
    spawnRoom();
  }

  function updateUI() {
    ui.healthText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    ui.healthBar.style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`;

    ui.energyText.textContent = `${Math.floor(player.energy)} / ${player.maxEnergy}`;
    ui.energyBar.style.width = `${clamp(player.energy / player.maxEnergy * 100, 0, 100)}%`;

    ui.roomText.textContent = `${room}${room % 5 === 0 ? " — BOSS" : ""}`;
    ui.coinText.textContent = `${coins} 🪙`;
    ui.hakiText.textContent = haki ? "ACTIVE" : "OFF";
    ui.hakiText.style.color = haki ? "#e5b6ff" : "#b7a9cc";
  }

  function spendEnergy(amount) {
    if (player.energy < amount) {
      notify("NOT ENOUGH ENERGY!");
      return false;
    }
    player.energy -= amount;
    return true;
  }

  function addEffect(x, y, radius, color, life = 0.4, type = "ring") {
    effects.push({ x, y, radius, color, life, maxLife: life, type });
  }

  function damageEnemy(enemy, amount, color = "#f0b8ff") {
    if (!enemy.alive) return;

    enemy.hp -= amount * (haki ? 1.5 : 1);
    enemy.flash = 0.12;
    addEffect(enemy.x, enemy.y, enemy.r + 8, color, 0.18, "spark");

    if (enemy.hp <= 0) {
      enemy.alive = false;
      const reward = enemy.boss ? 15 : enemy.type === "brute" ? 3 : 2;
      coins += reward;
      addEffect(enemy.x, enemy.y, enemy.r + 12, "#d7a1ff", 0.5, "burst");
      notify(`+${reward} MOCHI COINS`, 0.8);
    }
  }

  function damagePlayer(amount) {
    if (player.invulnerable > 0 || gameOver) return;
    player.hp -= amount;
    player.invulnerable = 0.6;
    addEffect(player.x, player.y, 35, "#ff5577", 0.3, "ring");

    if (player.hp <= 0) {
      player.hp = 0;
      gameOver = true;
      mouse.down = false;
      notify("YOU WERE DEFEATED — PRESS RESTART", 100);
    }
    updateUI();
  }

  function nearestEnemies(count = 1) {
    return enemies
      .filter(e => e.alive)
      .sort((a, b) => dist(player, a) - dist(player, b))
      .slice(0, count);
  }

  // Hold V to open two doughnut portals that fire giant fists.
  function castPortalFists() {
    if (player.portalCd > 0 || !spendEnergy(18)) return;
    player.portalCd = 1.1;

    const targets = nearestEnemies(3);
    const angles = [0, Math.PI];

    for (let i = 0; i < 2; i++) {
      const a = angles[i] + rand(-0.25, 0.25);
      const px = clamp(player.x + Math.cos(a) * 72, 35, W - 35);
      const py = clamp(player.y + Math.sin(a) * 72, 35, H - 35);
      addEffect(px, py, 35, "#ff8de6", 0.55, "portal");
      effects.push({
        x: px,
        y: py,
        radius: 30,
        color: "#ffb0ed",
        life: 0.65,
        maxLife: 0.65,
        type: "portal"
      });
    }

    for (const target of targets) {
      const angle = angleTo(player, target);
      projectiles.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 390,
        vy: Math.sin(angle) * 390,
        r: 20,
        damage: 34 + damageLevel * 6,
        life: 1.15,
        type: "giantFist",
        color: "#ff9de9",
        targetId: target.id
      });
    }

    notify("DOUGHNUT PORTALS — GIANT FISTS!");
  }

  function castFist() {
    if (player.fistCd > 0 || !spendEnergy(12)) return;
    player.fistCd = 0.45;

    const angle = angleTo(player, mouse);
    const reach = 110;
    const tx = player.x + Math.cos(angle) * reach;
    const ty = player.y + Math.sin(angle) * reach;

    addEffect(tx, ty, 43, "#e8c0ff", 0.28, "burst");

    let hit = false;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const d = Math.hypot(enemy.x - tx, enemy.y - ty);
      if (d < enemy.r + 42) {
        damageEnemy(enemy, 24 + damageLevel * 7);
        enemy.x += Math.cos(angle) * 16;
        enemy.y += Math.sin(angle) * 16;
        hit = true;
      }
    }
    notify(hit ? "MOCHI FIST HIT!" : "MOCHI FIST!");
  }

  function castHoming() {
    if (player.homingCd > 0 || !spendEnergy(24)) return;
    const targets = nearestEnemies(3);
    if (!targets.length) {
      notify("NO TARGETS!");
      player.energy += 24;
      return;
    }

    player.homingCd = 1.0;
    for (const enemy of targets) {
      const angle = angleTo(player, enemy);
      projectiles.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 180,
        vy: Math.sin(angle) * 180,
        r: 9,
        damage: 22 + damageLevel * 5,
        life: 3,
        type: "homing",
        color: "#e9c5ff",
        targetId: enemy.id
      });
    }
    notify("TRIPLE HOMING MOCHI!");
  }

  function castFreeze() {
    if (player.freezeCd > 0 || !spendEnergy(30)) return;
    player.freezeCd = 4;
    const radius = 155;

    addEffect(player.x, player.y, radius, "#69e7ff", 0.5, "ring");

    let frozen = 0;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < radius) {
        enemy.frozen = 2.5;
        damageEnemy(enemy, 8 + damageLevel * 2, "#78eaff");
        frozen++;
      }
    }
    notify(`MOCHI FLOOR FREEZE! ${frozen} ENEMIES FROZEN`);
  }

  function castSlam() {
    if (player.slamCd > 0 || !spendEnergy(35)) return;
    player.slamCd = 3.2;
    const radius = 185;

    addEffect(player.x, player.y, radius, "#ff8be8", 0.7, "ring");
    addEffect(player.x, player.y, radius * 0.7, "#d9a0ff", 0.45, "ring");

    let hits = 0;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < radius + enemy.r) {
        damageEnemy(enemy, 32 + damageLevel * 8);
        const a = angleTo(player, enemy);
        enemy.x += Math.cos(a) * 35;
        enemy.y += Math.sin(a) * 35;
        enemy.slow = 0.5;
        hits++;
      }
    }
    notify(`DOUGH STRING SLAM! ${hits} HITS`);
  }

  function toggleHaki() {
    haki = !haki;
    if (haki) {
      player.hakiTime = 999999;
      notify("HAKI ACTIVATED — 50% MORE DAMAGE!");
      addEffect(player.x, player.y, 45, "#b87aff", 0.45, "ring");
    } else {
      player.hakiTime = 0;
      notify("HAKI DEACTIVATED");
    }
    updateUI();
  }

  function slash() {
    if (attackCooldown > 0 || gameOver || clear) return;
    attackCooldown = 0.23;
    player.slashAnim = 0.18;

    const angle = angleTo(player, mouse);
    const reach = 66;
    let hit = false;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > reach + enemy.r) continue;

      const targetAngle = Math.atan2(dy, dx);
      let difference = Math.atan2(
        Math.sin(targetAngle - angle),
        Math.cos(targetAngle - angle)
      );

      if (Math.abs(difference) < 0.95) {
        damageEnemy(enemy, 12 + damageLevel * 4, "#ffffff");
        hit = true;
      }
    }

    addEffect(
      player.x + Math.cos(angle) * 38,
      player.y + Math.sin(angle) * 38,
      38,
      "#ffffff",
      0.2,
      "slash"
    );

    if (hit) notify("TRIDENT SLASH!");
  }

  function update(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.style.opacity = "0";
    }

    attackCooldown = Math.max(0, attackCooldown - dt);
    if (!player) return;

    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.fistCd = Math.max(0, player.fistCd - dt);
    player.homingCd = Math.max(0, player.homingCd - dt);
    player.freezeCd = Math.max(0, player.freezeCd - dt);
    player.slamCd = Math.max(0, player.slamCd - dt);
    player.portalCd = Math.max(0, player.portalCd - dt);
    player.slashAnim = Math.max(0, player.slashAnim - dt);

    if (!gameOver) {
      player.energy = Math.min(player.maxEnergy, player.energy + 8 * dt);
    }

    if (!gameOver && !clear) {
      let mx = 0;
      let my = 0;

      if (keys.has("w") || keys.has("arrowup")) my -= 1;
      if (keys.has("s") || keys.has("arrowdown")) my += 1;
      if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
      if (keys.has("d") || keys.has("arrowright")) mx += 1;

      const mag = Math.hypot(mx, my) || 1;
      player.x = clamp(player.x + (mx / mag) * player.speed * dt, player.r + 4, W - player.r - 4);
      player.y = clamp(player.y + (my / mag) * player.speed * dt, player.r + 4, H - player.r - 4);

      // Hold left mouse for repeated trident slashes.
      if (mouse.down) slash();
    }

    if (clear && portal && !gameOver) {
      portal.phase += dt;
      if (dist(player, portal) < player.r + portal.r + 4) {
        enterPortal();
        return;
      }
    }

    if (!gameOver && !clear) {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;

        enemy.hitCd = Math.max(0, enemy.hitCd - dt);
        enemy.frozen = Math.max(0, enemy.frozen - dt);
        enemy.slow = Math.max(0, enemy.slow - dt);
        enemy.flash = Math.max(0, enemy.flash - dt);
        enemy.phase += dt * 2;

        if (enemy.frozen > 0) continue;

        const angle = angleTo(enemy, player);
        const speed = enemy.speed * (enemy.slow > 0 ? 0.35 : 1);

        if (dist(enemy, player) > enemy.r + player.r + 4) {
          enemy.x += Math.cos(angle) * speed * dt;
          enemy.y += Math.sin(angle) * speed * dt;
        } else if (enemy.hitCd <= 0) {
          damagePlayer(enemy.damage);
          enemy.hitCd = enemy.boss ? 0.8 : 1.0;
        }

        enemy.x = clamp(enemy.x, enemy.r, W - enemy.r);
        enemy.y = clamp(enemy.y, enemy.r, H - enemy.r);
      }

      for (const p of projectiles) {
        p.life -= dt;

        if (p.type === "homing" || p.type === "giantFist") {
          const target = enemies.find(e => e.id === p.targetId && e.alive);
          if (target) {
            const angle = angleTo(p, target);
            const speed = p.type === "giantFist" ? 390 : 240;
            p.vx = angle === undefined ? p.vx : Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
          }
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.r + p.r) {
            damageEnemy(enemy, p.damage, p.color);
            p.life = 0;
            break;
          }
        }
      }

      projectiles = projectiles.filter(p => p.life > 0);

      if (enemies.every(e => !e.alive)) startPortal();
    }

    for (const e of effects) e.life -= dt;
    effects = effects.filter(e => e.life > 0);

    updateUI();
  }

  function drawBackground() {
    ctx.fillStyle = "#120d20";
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 430);
    glow.addColorStop(0, "#2c1745");
    glow.addColorStop(1, "#120d20");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#b78be411";
    ctx.lineWidth = 1;

    const grid = 40;
    for (let x = 0; x <= W; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Arena boundary.
    ctx.strokeStyle = "#9c5dd955";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, W - 4, H - 4);
  }

  function drawPortal() {
    if (!portal) return;

    const pulse = Math.sin(portal.phase * 4) * 4;
    ctx.save();
    ctx.translate(portal.x, portal.y);
    ctx.rotate(portal.phase * 0.6);

    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, portal.r + pulse + i * 8, portal.r * 0.65 + pulse + i * 5, i * 0.3, 0, TAU);
      ctx.strokeStyle = i === 1 ? "#e5b4ff" : "#9f55ff";
      ctx.lineWidth = 3 - i * 0.5;
      ctx.shadowColor = "#c084fc";
      ctx.shadowBlur = 16;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 12 + pulse * 0.3, 0, TAU);
    ctx.fillStyle = "#f1d6ff";
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NEXT ROOM", portal.x, portal.y + 52);
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    const frozen = enemy.frozen > 0;
    const color = frozen
      ? "#79eaff"
      : enemy.boss
        ? "#ff4fc8"
        : enemy.type === "brute"
          ? "#ff8c69"
          : enemy.type === "fast"
            ? "#ffdb70"
            : "#ef80e7";

    ctx.shadowColor = color;
    ctx.shadowBlur = enemy.boss ? 25 : 13;

    ctx.beginPath();
    ctx.arc(0, 0, enemy.r + (enemy.boss ? Math.sin(enemy.phase * 2) * 2 : 0), 0, TAU);
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : color;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(-enemy.r * 0.3, -enemy.r * 0.1, Math.max(2, enemy.r * 0.12), 0, TAU);
    ctx.arc(enemy.r * 0.3, -enemy.r * 0.1, Math.max(2, enemy.r * 0.12), 0, TAU);
    ctx.fillStyle = "#24112d";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, enemy.r * 0.16, enemy.r * 0.3, 0.15, Math.PI - 0.15);
    ctx.strokeStyle = "#24112d";
    ctx.lineWidth = 2;
    ctx.stroke();

    const barW = enemy.boss ? 76 : enemy.r * 2.2;
    const barY = -enemy.r - 13;
    ctx.fillStyle = "#28162f";
    ctx.fillRect(-barW / 2, barY, barW, 5);
    ctx.fillStyle = enemy.boss ? "#ff4fc8" : "#78f5a5";
    ctx.fillRect(-barW / 2, barY, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);

    if (enemy.boss) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MOCHI GUARDIAN", 0, -enemy.r - 20);
    }

    if (frozen) {
      ctx.strokeStyle = "#baf5ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.r + 5, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayer() {
    const angle = angleTo(player, mouse);

    ctx.save();
    ctx.translate(player.x, player.y);

    // Haki aura.
    if (haki) {
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 10 + Math.sin(performance.now() / 100) * 3, 0, TAU);
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#a855f7";
      ctx.shadowBlur = 20;
      ctx.stroke();

      for (let i = 0; i < 5; i++) {
        const a = performance.now() / 400 + i * TAU / 5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 27, Math.sin(a) * 27, 2.5, 0, TAU);
        ctx.fillStyle = "#e9b9ff";
        ctx.fill();
      }
    }

    // Player is a white circle.
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, TAU);
    ctx.fillStyle = player.invulnerable > 0 && Math.floor(performance.now() / 70) % 2
      ? "#d9a8ff"
      : "#ffffff";
    ctx.shadowColor = "#e7ccff";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#9d6cc8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Trident-like aiming slash indicator.
    ctx.rotate(angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(34, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(29, -6);
    ctx.lineTo(36, 0);
    ctx.lineTo(29, 6);
    ctx.stroke();

    if (player.slashAnim > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 45, -0.75, 0.75);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 12;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawProjectile(p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    if (p.type === "giantFist") {
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 23, 15, 0, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "#ffe6fb";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(7 + i * 5, -3, 4, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, TAU);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 18;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(-2, -2, p.r * 0.35, 0, TAU);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    ctx.restore();
  }

  function drawEffects() {
    for (const e of effects) {
      const t = clamp(e.life / e.maxLife, 0, 1);
      const radius = e.radius * (1 + (1 - t) * 0.35);

      ctx.save();
      ctx.globalAlpha = t;

      if (e.type === "burst") {
        ctx.beginPath();
        ctx.arc(e.x, e.y, radius * (1 - t * 0.25), 0, TAU);
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 25;
        ctx.fill();
      } else if (e.type === "spark") {
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(2, radius * t), 0, TAU);
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 15;
        ctx.fill();
      } else if (e.type === "portal") {
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, radius, radius * 0.65, performance.now() / 400, 0, TAU);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 20;
        ctx.stroke();
      } else if (e.type === "slash") {
        ctx.beginPath();
        ctx.arc(e.x, e.y, radius, -0.8, 0.8);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 5;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 15;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(e.x, e.y, radius * (1 - t * 0.15), 0, TAU);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4 * t + 1;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 18;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function draw() {
    drawBackground();
    drawPortal();

    for (const p of projectiles) drawProjectile(p);
    for (const enemy of enemies) {
      if (enemy.alive) drawEnemy(enemy);
    }

    drawEffects();
    drawPlayer();

    if (clear && portal) {
      ctx.save();
      ctx.fillStyle = "#f5e8ff";
      ctx.font = "bold 18px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#a855f7";
      ctx.shadowBlur = 15;
      ctx.fillText("ROOM CLEARED!", W / 2, 35);
      ctx.font = "13px Segoe UI, sans-serif";
      ctx.fillText("Walk into the purple portal to continue", W / 2, 55);
      ctx.restore();
    }

    if (gameOver) {
      ctx.fillStyle = "#090510bb";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "900 38px Segoe UI, sans-serif";
      ctx.shadowColor = "#ff5577";
      ctx.shadowBlur = 20;
      ctx.fillText("YOU WERE DEFEATED", W / 2, H / 2 - 12);
      ctx.shadowBlur = 0;
      ctx.font = "16px Segoe UI, sans-serif";
      ctx.fillText("Press RESTART to try again", W / 2, H / 2 + 24);
    }
  }

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000 || 0, 0.033);
    lastTime = time;

    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function resetGame() {
    room = 1;
    coins = 0;
    damageLevel = 0;
    healthLevel = 0;
    energyLevel = 0;
    haki = false;
    clear = false;
    gameOver = false;
    mouse.down = false;
    attackCooldown = 0;
    player = makePlayer();
    spawnRoom();
    ui.upgradeMessage.textContent = "";
    notify("WELCOME TO WHITE MOCHI — DOUGH V2 RAMPAGE!", 3);
  }

  function buyUpgrade(type) {
    if (type === "damage") {
      const cost = 8 + damageLevel * 6;
      if (coins < cost) {
        ui.upgradeMessage.textContent = `Need ${cost} coins for Damage Upgrade.`;
        return;
      }
      coins -= cost;
      damageLevel++;
      ui.upgradeMessage.textContent = `Damage upgraded to level ${damageLevel}!`;
    } else if (type === "health") {
      const cost = 8 + healthLevel * 6;
      if (coins < cost) {
        ui.upgradeMessage.textContent = `Need ${cost} coins for Health Upgrade.`;
        return;
      }
      coins -= cost;
      healthLevel++;
      player.maxHp = 100 + healthLevel * 20;
      player.hp = Math.min(player.maxHp, player.hp + 35);
      ui.upgradeMessage.textContent = `Max health increased to ${player.maxHp}!`;
    } else {
      const cost = 8 + energyLevel * 6;
      if (coins < cost) {
        ui.upgradeMessage.textContent = `Need ${cost} coins for Energy Upgrade.`;
        return;
      }
      coins -= cost;
      energyLevel++;
      player.maxEnergy = 100 + energyLevel * 20;
      player.energy = player.maxEnergy;
      ui.upgradeMessage.textContent = `Max energy increased to ${player.maxEnergy}!`;
    }

    updateUI();
  }

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (W / rect.width);
    mouse.y = (event.clientY - rect.top) * (H / rect.height);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }

    if (keys.has(key)) return;
    keys.add(key);

    if (gameOver) return;

    if (key === "z") castFist();
    if (key === "x") castHoming();
    if (key === "c") castFreeze();
    if (key === "b") castSlam();
    if (key === "t") toggleHaki();
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  canvas.addEventListener("mousemove", updateMouse);

  canvas.addEventListener("mousedown", (event) => {
    updateMouse(event);
    if (event.button === 0) {
      mouse.down = true;
      slash();
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) mouse.down = false;
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "v" && !event.repeat && !gameOver) {
      castPortalFists();
    }
  });

  ui.restartBtn.addEventListener("click", resetGame);
  ui.damageBtn.addEventListener("click", () => buyUpgrade("damage"));
  ui.healthBtn.addEventListener("click", () => buyUpgrade("health"));
  ui.energyBtn.addEventListener("click", () => buyUpgrade("energy"));

  resetGame();
  requestAnimationFrame(frame);
})();
