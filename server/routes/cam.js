const express = require('express');
const router = express.Router();
const pool = require('../db');

function requireAuth(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ error: '로그인 필요' });
    next();
}

router.get('/settings', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT cam_enabled, cam_visibility FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = result.rows[0] || {};
        res.json({
            cam_enabled: user.cam_enabled || false,
            cam_visibility: user.cam_visibility || 'all'
        });
    } catch (err) {
        console.error('cam settings 조회 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/settings', requireAuth, async (req, res) => {
    const { cam_enabled, cam_visibility } = req.body;
    const validVisibility = ['all', 'admin'];
    const vis = validVisibility.includes(cam_visibility) ? cam_visibility : 'all';
    try {
        await pool.query(
            'UPDATE users SET cam_enabled = $1, cam_visibility = $2 WHERE id = $3',
            [!!cam_enabled, vis, req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('cam settings 저장 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/upload', requireAuth, async (req, res) => {
    const { image_data, visibility } = req.body;
    if (!image_data || !image_data.startsWith('data:image/')) {
        return res.status(400).json({ error: '올바르지 않은 이미지 데이터' });
    }
    const validVisibility = ['all', 'admin'];
    const vis = validVisibility.includes(visibility) ? visibility : 'all';

    try {
        const userResult = await pool.query(
            'SELECT cam_enabled FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!userResult.rows[0]?.cam_enabled) {
            return res.status(403).json({ error: '캠인증이 비활성화 상태입니다' });
        }

        await pool.query(
            'INSERT INTO cam_captures (user_id, image_data, visibility) VALUES ($1, $2, $3)',
            [req.session.userId, image_data, vis]
        );

        await pool.query(
            `DELETE FROM cam_captures WHERE user_id = $1 AND id NOT IN (
                SELECT id FROM cam_captures WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100
            )`,
            [req.session.userId]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('cam 업로드 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/recent', requireAuth, async (req, res) => {
    try {
        const isAdmin = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
        const userIsAdmin = isAdmin.rows[0]?.is_admin || false;

        let query, params;
        if (userIsAdmin) {
            query = `
                SELECT c.id, c.user_id, u.nickname, c.image_data, c.visibility, c.created_at
                FROM cam_captures c
                JOIN users u ON u.id = c.user_id
                ORDER BY c.created_at DESC
                LIMIT 50
            `;
            params = [];
        } else {
            query = `
                SELECT c.id, c.user_id, u.nickname, c.image_data, c.visibility, c.created_at
                FROM cam_captures c
                JOIN users u ON u.id = c.user_id
                WHERE c.visibility = 'all' OR c.user_id = $1
                ORDER BY c.created_at DESC
                LIMIT 50
            `;
            params = [req.session.userId];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('cam recent 조회 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/user/:userId', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.userId);
    if (!targetId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const isAdmin = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
        const userIsAdmin = isAdmin.rows[0]?.is_admin || false;

        let query, params;
        if (userIsAdmin || req.session.userId === targetId) {
            query = `
                SELECT id, image_data, visibility, created_at
                FROM cam_captures WHERE user_id = $1
                ORDER BY created_at DESC LIMIT 20
            `;
            params = [targetId];
        } else {
            query = `
                SELECT id, image_data, visibility, created_at
                FROM cam_captures WHERE user_id = $1 AND visibility = 'all'
                ORDER BY created_at DESC LIMIT 20
            `;
            params = [targetId];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('cam user 조회 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
