const BG = {
    canvas: null,
    ctx: null,
    stars: [],
    shootingStars: [],
    quality: null,
    t: 0,
    topPct: 100,

    init(topPct) {
        this.topPct = parseFloat(topPct) || 100;
        this.canvas = document.getElementById('bg-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.quality = this.getQuality();
        this.resize();
        this.generate();
        this.loop();
        window.addEventListener('resize', () => {
            this.resize();
            this.generate();
        });
        this.applyBuildingGlow();
    },

    getQuality() {
        const p = this.topPct;
        if (p <= 1)  return { stars: 1100, maxOp: 1.0,  aurora: true,  shooting: true,  bgTop: [10,8,28],  bgMid: [8,6,20]  };
        if (p <= 5)  return { stars: 750,  maxOp: 0.88, aurora: false, shooting: true,  bgTop: [10,8,24],  bgMid: [8,6,16]  };
        if (p <= 15) return { stars: 480,  maxOp: 0.7,  aurora: false, shooting: true,  bgTop: [10,8,20],  bgMid: [8,6,12]  };
        if (p <= 30) return { stars: 280,  maxOp: 0.5,  aurora: false, shooting: false, bgTop: [10,8,14],  bgMid: [8,6,8]   };
        if (p <= 60) return { stars: 120,  maxOp: 0.32, aurora: false, shooting: false, bgTop: [10,8,10],  bgMid: [8,6,6]   };
        return             { stars: 45,   maxOp: 0.18, aurora: false, shooting: false, bgTop: [10,10,10], bgMid: [8,8,8]   };
    },

    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    generate() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const q = this.quality;

        this.stars = Array.from({ length: q.stars }, () => {
            const big = Math.random() < 0.06;
            return {
                x: Math.random() * W,
                y: Math.random() * H * 0.88,
                r: big ? (Math.random() * 1.8 + 1.2) : (Math.random() * 0.9 + 0.2),
                op: Math.random() * q.maxOp * 0.5 + q.maxOp * 0.35,
                ts: Math.random() * 0.005 + 0.002,
                to: Math.random() * Math.PI * 2,
                color: Math.random() < 0.08 ? '#ffeebb'
                     : Math.random() < 0.05 ? '#aaccff'
                     : '#ffffff'
            };
        });

        this.shootingStars = [];
    },

    drawBg() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const q = this.quality;
        const [r1, g1, b1] = q.bgTop;
        const [r2, g2, b2] = q.bgMid;
        
        const grad = this.ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,   `rgb(${r1+14},${g1+14},${b1+32})`);
        grad.addColorStop(0.4, `rgb(${r2+10},${g2+10},${b2+24})`);
        grad.addColorStop(0.7, `rgb(18,18,18)`);
        grad.addColorStop(1,   `rgb(18,18,18)`);
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, W, H);

        const vignette = this.ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        this.ctx.fillStyle = vignette;
        this.ctx.fillRect(0, 0, W, H);

        if (q.stars > 400) {
            this.ctx.globalCompositeOperation = 'screen';
            const cloudGrad = this.ctx.createRadialGradient(W*0.3, H*0.3, 0, W*0.3, H*0.3, W*0.6);
            cloudGrad.addColorStop(0, 'rgba(35,18,70,0.12)');
            cloudGrad.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = cloudGrad;
            this.ctx.fillRect(0, 0, W, H);
            this.ctx.globalCompositeOperation = 'source-over';
        }
    },

    drawAurora() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const ctx = this.ctx;
        const t = this.t;
        const bands = [
            { c: '80,40,180', yBase: 0.18, amp: 45, speed: 0.25 },
            { c: '40,60,210', yBase: 0.26, amp: 35, speed: 0.38 },
            { c: '120,30,160', yBase: 0.14, amp: 55, speed: 0.18 }
        ];
        bands.forEach(({ c, yBase, amp, speed }, i) => {
            const grad = ctx.createLinearGradient(0, H * (yBase - 0.06), 0, H * (yBase + 0.28));
            grad.addColorStop(0,   `rgba(${c},0)`);
            grad.addColorStop(0.4, `rgba(${c},0.07)`);
            grad.addColorStop(1,   `rgba(${c},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, H * yBase);
            const segs = 12;
            for (let s = 0; s <= segs; s++) {
                const px = (s / segs) * W;
                const wave = Math.sin(px * 0.003 + t * speed + i * 1.4) * amp
                           + Math.sin(px * 0.006 + t * speed * 0.6 + i) * (amp * 0.4);
                ctx.lineTo(px, H * yBase + wave);
            }
            ctx.lineTo(W, H * 0.6);
            ctx.lineTo(0, H * 0.6);
            ctx.closePath();
            ctx.fill();
        });
    },

    drawStars() {
        const t = this.t;
        const ctx = this.ctx;
        this.stars.forEach(s => {
            const twinkle = Math.sin(t * s.ts * 60 + s.to) * 0.28 + 0.72;
            ctx.globalAlpha = s.op * twinkle;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    },

    maybeShoot() {
        if (this.shootingStars.length < 4 && Math.random() < 0.004) {
            const W = this.canvas.width;
            const H = this.canvas.height;
            const angle = (Math.random() * 30 + 15) * Math.PI / 180;
            const speed = 7 + Math.random() * 8;
            this.shootingStars.push({
                x: Math.random() * W,
                y: Math.random() * H * 0.4,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                maxLen: 120 + Math.random() * 100,
                color: Math.random() < 0.2 ? '#ffccaa' : '#ffffff'
            });
        }
    },

    drawShootingStars() {
        const ctx = this.ctx;
        this.shootingStars = this.shootingStars.filter(s => s.life > 0);
        this.shootingStars.forEach(s => {
            const tailX = s.x - s.vx * (s.maxLen / 10);
            const tailY = s.y - s.vy * (s.maxLen / 10);
            const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
            grad.addColorStop(0, `rgba(255,255,255,0)`);
            grad.addColorStop(1, s.color || '#ffffff');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
            
            ctx.fillStyle = s.color || '#ffffff';
            ctx.globalAlpha = s.life;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 1.2, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1;

            s.x += s.vx;
            s.y += s.vy;
            s.life -= 0.018;
        });
    },

    applyBuildingGlow() {
        const castle = document.getElementById('my-castle');
        if (!castle) return;
        let glow = castle.querySelector('.castle-glow');
        if (!glow) {
            glow = document.createElement('div');
            glow.className = 'castle-glow';
            castle.insertBefore(glow, castle.firstChild);
        }
        const p = this.topPct;
        let size, opacity, color, pulse;
        if (p <= 1)  { size = 320; opacity = 0.55; color = '212,175,55';  pulse = true;  }
        else if (p <= 5)  { size = 240; opacity = 0.42; color = '200,160,50';  pulse = true;  }
        else if (p <= 15) { size = 180; opacity = 0.30; color = '180,140,40';  pulse = false; }
        else if (p <= 30) { size = 130; opacity = 0.20; color = '150,120,30';  pulse = false; }
        else if (p <= 60) { size = 90;  opacity = 0.12; color = '120,100,20';  pulse = false; }
        else              { size = 50;  opacity = 0.07; color = '100,80,10';   pulse = false; }

        glow.style.cssText = `
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            width: ${size}px;
            height: ${size * 0.45}px;
            border-radius: 50%;
            background: radial-gradient(ellipse, rgba(${color},${opacity}) 0%, transparent 70%);
            pointer-events: none;
            z-index: -1;
            ${pulse ? 'animation: glowPulse 2.5s ease-in-out infinite;' : ''}
        `;
    },

    drawDaytime() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const ctx = this.ctx;
        const t = this.t;

        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0,    '#1460a8');
        sky.addColorStop(0.42, '#4aa5e0');
        sky.addColorStop(0.72, '#b5daf5');
        sky.addColorStop(0.88, '#e8eef4');
        sky.addColorStop(1,    '#F2F4F7');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        const sunX = W * 0.78, sunY = H * 0.16;
        const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 240);
        halo.addColorStop(0, 'rgba(255,244,180,0.20)');
        halo.addColorStop(1, 'rgba(255,244,180,0)');
        ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

        const inner = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 72);
        inner.addColorStop(0, 'rgba(255,252,200,0.5)');
        inner.addColorStop(1, 'rgba(255,252,200,0)');
        ctx.fillStyle = inner; ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#fffbe8';
        ctx.beginPath(); ctx.arc(sunX, sunY, 36, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sunX, sunY, 24, 0, Math.PI * 2); ctx.fill();

        this.drawClouds(ctx, W, H, t);
    },

    drawClouds(ctx, W, H, t) {
        const defs = [
            { bx: 0.12, by: 0.11, sc: 1.2,  sp: 0.000075 },
            { bx: 0.40, by: 0.07, sc: 0.82, sp: 0.000055 },
            { bx: 0.65, by: 0.14, sc: 1.05, sp: 0.000090 },
            { bx: 0.28, by: 0.21, sc: 0.62, sp: 0.000065 },
        ];
        defs.forEach(c => {
            const cx = ((c.bx * W + t * c.sp * W) % (W * 1.35)) - W * 0.18;
            const cy = c.by * H;
            ctx.globalAlpha = 0.90;
            this.drawCloud(ctx, cx, cy, c.sc);
            ctx.globalAlpha = 1;
        });
    },

    drawCloud(ctx, cx, cy, sc) {
        const s = sc * 46;
        ctx.fillStyle = 'rgba(255,255,255,0.93)';
        ctx.beginPath();
        ctx.arc(cx,             cy,           s * 0.60, 0, Math.PI * 2);
        ctx.arc(cx + s * 0.70,  cy - s * 0.14, s * 0.50, 0, Math.PI * 2);
        ctx.arc(cx + s * 1.32,  cy,           s * 0.55, 0, Math.PI * 2);
        ctx.arc(cx + s * 0.66,  cy + s * 0.44, s * 0.60, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(180,210,240,0.28)';
        ctx.beginPath();
        ctx.ellipse(cx + s * 0.66, cy + s * 0.52, s * 0.92, s * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    loop() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        this.ctx.clearRect(0, 0, W, H);
        const isLight = document.body.classList.contains('light');
        if (isLight) {
            this.drawDaytime();
        } else {
            this.drawBg();
            if (this.quality.aurora) this.drawAurora();
            this.drawStars();
            if (this.quality.shooting) { this.maybeShoot(); this.drawShootingStars(); }
        }
        this.t++;
        requestAnimationFrame(() => this.loop());
    }
};
