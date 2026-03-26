const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const pool = require('../db');
const {
  escapeHtml,
  escapeXml,
  getSiteBaseUrl,
  truncateText,
  wrapTextForSvg,
  formatDurationKorean,
  renderSvgTextLines,
} = require('../utils/textHelpers');

async function getRoomInvitePreviewData(code) {
  const result = await pool.query(
    `SELECT r.id, r.name, r.goal, r.invite_code, r.max_members,
        u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count,
        (SELECT COUNT(*) FROM study_room_members m2
         JOIN users u2 ON u2.id = m2.user_id
         WHERE m2.room_id = r.id AND u2.is_studying = TRUE) AS active_count
     FROM study_rooms r
     JOIN users u ON u.id = r.creator_id
     WHERE r.invite_code = $1 AND r.is_active = TRUE
     LIMIT 1`,
    [code],
  );

  if (!result.rows.length) return null;

  const room = result.rows[0];
  const leaderboard = await pool.query(
    `SELECT u.nickname,
        COALESCE(SUM(sr.duration_sec), 0) AS today_sec,
        RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec), 0) DESC) AS rank
     FROM study_room_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN study_records sr ON sr.user_id = u.id
       AND sr.result = 'SUCCESS'
       AND sr.created_at >= CURRENT_DATE
     WHERE m.room_id = $1
     GROUP BY u.id, u.nickname
     ORDER BY today_sec DESC, u.nickname ASC
     LIMIT 3`,
    [room.id],
  );

  return {
    id: room.id,
    name: room.name || '그룹 타이머',
    goal: room.goal || '',
    inviteCode: room.invite_code,
    maxMembers: Number(room.max_members) || 0,
    memberCount: Number(room.member_count) || 0,
    activeCount: Number(room.active_count) || 0,
    creatorNickname: room.creator_nickname || 'P.A.T.H',
    leaders: leaderboard.rows.map((row) => ({
      nickname: row.nickname || '익명',
      todaySec: Number(row.today_sec) || 0,
      rank: Number(row.rank) || 0,
    })),
  };
}

function buildRoomInviteOgSvg(room) {
  const titleLines = wrapTextForSvg(room.name, 16, 2);
  const goalLines = wrapTextForSvg(
    room.goal || '목표를 향해 함께 공부하는 P.A.T.H 그룹 타이머 방',
    33,
    room.goal ? 2 : 1,
  );
  const leader = room.leaders[0] || null;
  const leaderName = leader ? truncateText(leader.nickname, 14) : '아직 1위 없음';
  const leaderTime =
    leader && leader.todaySec > 0
      ? `오늘 ${formatDurationKorean(leader.todaySec)}`
      : '오늘 첫 기록을 기다리는 중';
  const statusLabel =
    room.activeCount > 0
      ? `지금 ${room.activeCount}명이 공부 중`
      : '지금 합류해서 첫 기록을 만들어보세요';
  const activeLabel = room.activeCount > 0 ? 'LIVE' : 'READY';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
  <linearGradient id="bg" x1="80" y1="40" x2="1120" y2="630" gradientUnits="userSpaceOnUse">
    <stop stop-color="#071120"/>
    <stop offset="0.56" stop-color="#102746"/>
    <stop offset="1" stop-color="#1D4F91"/>
  </linearGradient>
  <linearGradient id="panel" x1="200" y1="80" x2="980" y2="570" gradientUnits="userSpaceOnUse">
    <stop stop-color="rgba(255,255,255,0.18)"/>
    <stop offset="1" stop-color="rgba(255,255,255,0.08)"/>
  </linearGradient>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#7FB3FF"/>
    <stop offset="1" stop-color="#D9E9FF"/>
  </linearGradient>
  <filter id="shadow" x="0" y="0" width="1200" height="630" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="24" stdDeviation="36" flood-color="#020611" flood-opacity="0.45"/>
  </filter>
  <style>
    .label { fill: rgba(228,239,255,0.78); font: 700 20px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; letter-spacing: 0.14em; }
    .pill { fill: #EAF3FF; font: 800 20px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .title { fill: #F8FBFF; font: 900 58px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .goal { fill: rgba(238,245,255,0.88); font: 600 28px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .cardTitle { fill: rgba(227,239,255,0.68); font: 700 18px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; letter-spacing: 0.08em; }
    .cardValue { fill: #FFFFFF; font: 900 42px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .cardMeta { fill: rgba(227,239,255,0.72); font: 600 18px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .heroMeta { fill: #BFD7FF; font: 700 26px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .leaderTitle { fill: rgba(227,239,255,0.7); font: 700 17px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; letter-spacing: 0.08em; }
    .leaderName { fill: #FFFFFF; font: 800 30px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .leaderMeta { fill: #D6E6FF; font: 600 22px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
    .footer { fill: rgba(224,236,255,0.76); font: 700 20px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
  </style>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="145" cy="118" r="138" fill="rgba(255,255,255,0.07)"/>
  <circle cx="1068" cy="94" r="114" fill="rgba(255,255,255,0.07)"/>
  <circle cx="1118" cy="566" r="170" fill="rgba(255,255,255,0.05)"/>
  <rect x="60" y="54" width="1080" height="522" rx="34" fill="url(#panel)" stroke="rgba(255,255,255,0.18)" filter="url(#shadow)"/>

  <rect x="96" y="92" width="176" height="44" rx="22" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.14)"/>
  <text class="label" x="124" y="121">P.A.T.H ROOM</text>

  <rect x="924" y="92" width="180" height="52" rx="26" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)"/>
  <circle cx="962" cy="118" r="8" fill="${room.activeCount > 0 ? '#8FDB8B' : '#BFD7FF'}"/>
  <text class="pill" x="982" y="125">${escapeXml(activeLabel)}</text>

  <circle cx="132" cy="195" r="28" fill="url(#accent)"/>
  <text x="118" y="206" fill="#0B1730" style="font: 900 30px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;">P</text>

  <text class="heroMeta" x="176" y="205">함께 공부하는 그룹 타이머</text>
  ${renderSvgTextLines(titleLines, 96, 278, 72, 'title')}
  ${renderSvgTextLines(goalLines, 100, 402, 40, 'goal')}

  <rect x="96" y="456" width="370" height="88" rx="24" fill="rgba(5,16,32,0.28)" stroke="rgba(255,255,255,0.12)"/>
  <text class="leaderTitle" x="126" y="490">ROOM STATUS</text>
  <text class="leaderMeta" x="126" y="525">${escapeXml(statusLabel)}</text>

  <rect x="510" y="168" width="178" height="120" rx="24" fill="rgba(9,17,33,0.34)" stroke="rgba(255,255,255,0.14)"/>
  <text class="cardTitle" x="540" y="204">참여 인원</text>
  <text class="cardValue" x="540" y="252">${room.memberCount}</text>
  <text class="cardMeta" x="540" y="278">최대 ${room.maxMembers}명</text>

  <rect x="712" y="168" width="178" height="120" rx="24" fill="rgba(9,17,33,0.34)" stroke="rgba(255,255,255,0.14)"/>
  <text class="cardTitle" x="742" y="204">실시간 집중</text>
  <text class="cardValue" x="742" y="252">${room.activeCount}</text>
  <text class="cardMeta" x="742" y="278">지금 공부 중</text>

  <rect x="914" y="168" width="190" height="120" rx="24" fill="rgba(9,17,33,0.34)" stroke="rgba(255,255,255,0.14)"/>
  <text class="cardTitle" x="944" y="204">방장</text>
  <text class="leaderName" x="944" y="248">${escapeXml(truncateText(room.creatorNickname, 10))}</text>
  <text class="cardMeta" x="944" y="278">스터디 호스트</text>

  <rect x="510" y="320" width="594" height="154" rx="28" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.14)"/>
  <text class="leaderTitle" x="544" y="362">TODAY TOP RANK</text>
  <text class="leaderName" x="544" y="416">${escapeXml(leaderName)}</text>
  <text class="leaderMeta" x="544" y="452">${escapeXml(leaderTime)}</text>
  <rect x="934" y="352" width="130" height="86" rx="24" fill="rgba(8,24,46,0.42)" stroke="rgba(255,255,255,0.12)"/>
  <text x="976" y="388" fill="#BFD7FF" style="font: 800 18px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;">오늘 순위</text>
  <text x="979" y="427" fill="#FFFFFF" style="font: 900 34px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;">#1</text>

  <rect x="510" y="496" width="594" height="48" rx="24" fill="rgba(8,24,46,0.38)"/>
  <text class="footer" x="544" y="528">방 코드 ${escapeXml(String(room.inviteCode || '').toUpperCase())} · 공유하면 바로 합류할 수 있습니다</text>
</svg>`;
}

async function renderRoomInviteOgPng(room) {
  const svg = buildRoomInviteOgSvg(room);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, quality: 90 }).toBuffer();
}

const roomInviteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/og/room/:code.png', roomInviteLimiter, async (req, res) => {
  const code = String(req.params.code || '')
    .trim()
    .toLowerCase()
    .slice(0, 12);
  if (!code) return res.status(400).type('text/plain').send('bad-request');

  try {
    const room = await getRoomInvitePreviewData(code);
    if (!room) return res.status(404).type('text/plain').send('not-found');

    const png = await renderRoomInviteOgPng(room);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.send(png);
  } catch (err) {
    console.error('room og image error:', err);
    return res.status(500).type('text/plain').send('image-generation-failed');
  }
});

router.get('/room/:code', roomInviteLimiter, async (req, res) => {
  const code = String(req.params.code || '')
    .trim()
    .toLowerCase()
    .slice(0, 12);
  if (!code) return res.status(400).type('text/html').send('<h1>잘못된 요청</h1>');

  try {
    const baseUrl = getSiteBaseUrl(req);
    const canonical = `${baseUrl}/room/${code}`;
    const room = await getRoomInvitePreviewData(code);

    if (!room) {
      const html = `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>방을 찾을 수 없습니다 - P.A.T.H</title>
<meta name="robots" content="noindex">
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#0d0d0d;color:#fff}</style>
</head><body><h1>방을 찾을 수 없습니다</h1><p>초대 링크가 만료되었거나 잘못된 링크입니다.</p>
<a href="/study-hub/" style="color:#d4af37">스터디 허브로 이동 →</a></body></html>`;
      return res.status(404).type('text/html').send(html);
    }

    const memberCount = room.memberCount;
    const activeCount = room.activeCount;
    const maxMembers = room.maxMembers;
    const roomName = room.name;
    const goal = room.goal || '';
    const topLeader = room.leaders[0] || null;

    const ogTitle = `${activeCount > 0 ? '🔥' : '📚'} ${roomName} (${memberCount}/${maxMembers}명)`;
    const ogDescriptionParts = [];
    if (goal) ogDescriptionParts.push(goal);
    ogDescriptionParts.push(
      activeCount > 0
        ? `지금 ${activeCount}명이 실시간으로 공부 중입니다.`
        : '지금 바로 함께 공부를 시작해보세요.',
    );
    if (topLeader && topLeader.todaySec > 0) {
      ogDescriptionParts.push(
        `오늘 1위 ${topLeader.nickname} ${formatDurationKorean(topLeader.todaySec)}`,
      );
    }
    const ogDescription = ogDescriptionParts.join(' · ');
    const ogImageVersion = [memberCount, activeCount, topLeader ? topLeader.todaySec : 0].join('-');
    const ogImage = `${baseUrl}/og/room/${encodeURIComponent(code)}.png?v=${encodeURIComponent(ogImageVersion)}`;
    const ogImageAlt = `${roomName} 그룹 타이머 공유 이미지`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${ogTitle} | P.A.T.H</title>
  <meta name="description" content="${escapeHtml(ogDescription)}">
  <meta name="robots" content="noindex">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="P.A.T.H">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:image:alt" content="${escapeHtml(ogImageAlt)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#0d0d0d;color:#f0f0f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#151515;border:1px solid #2a2a2a;border-radius:20px;padding:36px 28px;max-width:440px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.5)}
    .badge{display:inline-block;background:#1a1a2e;color:#d4af37;border:1px solid #d4af37;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:16px}
    h1{font-size:22px;font-weight:800;color:#fff;margin-bottom:8px;line-height:1.4}
    .goal{color:#888;font-size:14px;margin-bottom:20px;line-height:1.5}
    .stats{display:flex;gap:12px;justify-content:center;margin-bottom:24px}
    .stat{background:#1e1e1e;border-radius:12px;padding:12px 18px;flex:1}
    .stat-val{font-size:22px;font-weight:800;color:#d4af37}
    .stat-label{font-size:11px;color:#666;margin-top:2px}
    .active-pill{display:inline-flex;align-items:center;gap:6px;background:#1a2e1a;color:#4caf50;border:1px solid #4caf50;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:600;margin-bottom:24px}
    .active-dot{width:8px;height:8px;background:#4caf50;border-radius:50%;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .join-btn{display:block;width:100%;background:linear-gradient(135deg,#d4af37,#f0c040);color:#000;border:none;border-radius:12px;padding:16px;font-size:17px;font-weight:800;cursor:pointer;text-decoration:none;margin-bottom:12px;transition:opacity .2s}
    .join-btn:hover{opacity:.9}
    .login-note{font-size:12px;color:#555}
    .creator{font-size:12px;color:#555;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">P.A.T.H 그룹 타이머</div>
    <h1>${escapeHtml(roomName)}</h1>
    ${goal ? `<p class="goal">${escapeHtml(goal)}</p>` : ''}
    <div class="stats">
      <div class="stat"><div class="stat-val">${memberCount}</div><div class="stat-label">참여 중</div></div>
      <div class="stat"><div class="stat-val">${maxMembers}</div><div class="stat-label">최대 인원</div></div>
      <div class="stat"><div class="stat-val">${activeCount}</div><div class="stat-label">지금 공부 중</div></div>
    </div>
    ${activeCount > 0 ? `<div class="active-pill"><span class="active-dot"></span>${activeCount}명 실시간으로 달리는 중</div>` : ''}
    <a class="join-btn" href="/study-hub/?join=${encodeURIComponent(code)}">⚔️ 방 합류하기</a>
    <div class="login-note">로그인이 필요합니다. 계정이 없으면 회원가입 후 이용하세요.</div>
    <div class="creator">방장: ${escapeHtml(room.creatorNickname)}</div>
  </div>
  <script>
    // External share crawlers need this HTML for OG tags.
    // Actual join is handled by the CTA above.
  </script>
</body>
</html>`;

    return res.type('text/html').send(html);
  } catch (err) {
    console.error('[room] GET /room/:code', err.message);
    return res.status(500).type('text/html').send('<h1>서버 오류</h1>');
  }
});

module.exports = router;
