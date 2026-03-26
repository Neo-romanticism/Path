const express = require('express');
const router = express.Router();
const {
  pool,
  writeAdminAuditLog,
  parseAdminScoreField,
  percentileToGrade,
  requireAdmin,
} = require('./_helpers');

// 인증 대기 목록 (성적표 + 내신)
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nickname, u.real_name, u.university, u.prev_university, u.is_n_su,
                    COALESCE(es.score_image_url, u.score_image_url) AS score_image_url,
                    CASE
                        WHEN es.verified_status = 'pending' THEN 'pending'
                        ELSE u.score_status
                    END AS score_status,
                    es.korean_std, es.korean_percentile,
                    es.math_std, es.math_percentile,
                    es.english_std, es.english_percentile, es.english_grade,
                    es.explore1_std, es.explore1_percentile,
                    es.explore2_std, es.explore2_percentile,
                    es.history_std, es.history_percentile, es.history_grade,
                    es.second_lang_std, es.second_lang_percentile,
                    u.gpa_image_url, u.gpa_status, u.gpa_score, u.created_at,
                    es.verified_status AS apply_score_status,
                    es.updated_at AS apply_score_updated_at
             FROM users u
             LEFT JOIN exam_scores es ON es.user_id = u.id
             WHERE u.score_status = 'pending'
                OR u.gpa_status = 'pending'
                OR es.verified_status = 'pending'
             ORDER BY COALESCE(es.updated_at, u.created_at) DESC`,
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('admin pending error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 성적 승인
router.post('/approve-score', requireAdmin, async (req, res) => {
  const userId = parseInt(req.body?.user_id, 10);
  if (!userId) {
    return res.status(400).json({ error: '유저 ID를 확인해주세요.' });
  }

  const scorePayload =
    req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : null;
  let approvedExamScores = null;

  if (scorePayload) {
    const koreanStd = parseAdminScoreField(scorePayload.korean_std, {
      label: '국어 표준점수',
      min: 0,
      max: 200,
    });
    if (!koreanStd.ok) return res.status(400).json({ error: koreanStd.error });
    const koreanPercentile = parseAdminScoreField(scorePayload.korean_percentile, {
      label: '국어 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
    });
    if (!koreanPercentile.ok) return res.status(400).json({ error: koreanPercentile.error });

    const mathStd = parseAdminScoreField(scorePayload.math_std, {
      label: '수학 표준점수',
      min: 0,
      max: 200,
    });
    if (!mathStd.ok) return res.status(400).json({ error: mathStd.error });
    const mathPercentile = parseAdminScoreField(scorePayload.math_percentile, {
      label: '수학 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
    });
    if (!mathPercentile.ok) return res.status(400).json({ error: mathPercentile.error });

    const englishStd = parseAdminScoreField(scorePayload.english_std, {
      label: '영어 표준점수',
      min: 0,
      max: 200,
    });
    if (!englishStd.ok) return res.status(400).json({ error: englishStd.error });
    const englishPercentile = parseAdminScoreField(scorePayload.english_percentile, {
      label: '영어 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
    });
    if (!englishPercentile.ok) return res.status(400).json({ error: englishPercentile.error });

    const explore1Std = parseAdminScoreField(scorePayload.explore1_std, {
      label: '탐구1 표준점수',
      min: 0,
      max: 100,
    });
    if (!explore1Std.ok) return res.status(400).json({ error: explore1Std.error });
    const explore1Percentile = parseAdminScoreField(scorePayload.explore1_percentile, {
      label: '탐구1 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
    });
    if (!explore1Percentile.ok) return res.status(400).json({ error: explore1Percentile.error });

    const explore2Std = parseAdminScoreField(scorePayload.explore2_std, {
      label: '탐구2 표준점수',
      min: 0,
      max: 100,
    });
    if (!explore2Std.ok) return res.status(400).json({ error: explore2Std.error });
    const explore2Percentile = parseAdminScoreField(scorePayload.explore2_percentile, {
      label: '탐구2 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
    });
    if (!explore2Percentile.ok) return res.status(400).json({ error: explore2Percentile.error });

    const historyStd = parseAdminScoreField(scorePayload.history_std, {
      label: '한국사 표준점수',
      min: 0,
      max: 100,
    });
    if (!historyStd.ok) return res.status(400).json({ error: historyStd.error });
    const historyPercentile = parseAdminScoreField(scorePayload.history_percentile, {
      label: '한국사 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
    });
    if (!historyPercentile.ok) return res.status(400).json({ error: historyPercentile.error });

    const secondLangStd = parseAdminScoreField(scorePayload.second_lang_std, {
      label: '제2외국어 표준점수',
      min: 0,
      max: 100,
      required: false,
    });
    if (!secondLangStd.ok) return res.status(400).json({ error: secondLangStd.error });
    const secondLangPercentile = parseAdminScoreField(scorePayload.second_lang_percentile, {
      label: '제2외국어 백분위',
      min: 0,
      max: 100,
      allowDecimal: true,
      required: false,
    });
    if (!secondLangPercentile.ok)
      return res.status(400).json({ error: secondLangPercentile.error });

    const hasSecondLangStd = secondLangStd.value !== null;
    const hasSecondLangPercentile = secondLangPercentile.value !== null;
    if (hasSecondLangStd !== hasSecondLangPercentile) {
      return res.status(400).json({ error: '제2외국어는 표준점수와 백분위를 함께 입력해주세요.' });
    }

    approvedExamScores = {
      korean_std: koreanStd.value,
      korean_percentile: koreanPercentile.value,
      math_std: mathStd.value,
      math_percentile: mathPercentile.value,
      english_std: englishStd.value,
      english_percentile: englishPercentile.value,
      english_grade: percentileToGrade(englishPercentile.value),
      explore1_std: explore1Std.value,
      explore1_percentile: explore1Percentile.value,
      explore2_std: explore2Std.value,
      explore2_percentile: explore2Percentile.value,
      history_std: historyStd.value,
      history_percentile: historyPercentile.value,
      history_grade: percentileToGrade(historyPercentile.value),
      second_lang_std: secondLangStd.value,
      second_lang_percentile: secondLangPercentile.value,
    };
  } else {
    return res.status(400).json({ error: '과목별 점수 payload(scores)가 필요합니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const beforeRes = await client.query('SELECT id, score_status FROM users WHERE id = $1', [
      userId,
    ]);
    if (!beforeRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }

    await client.query(`UPDATE users SET score_status = 'approved' WHERE id = $1`, [userId]);

    if (approvedExamScores) {
      await client.query(
        `INSERT INTO exam_scores (
                    user_id,
                    korean_std, korean_percentile,
                    math_std, math_percentile,
                    english_std, english_percentile, english_grade,
                    explore1_std, explore1_percentile,
                    explore2_std, explore2_percentile,
                    history_std, history_percentile, history_grade,
                    second_lang_std, second_lang_percentile,
                    verified_status, verified_at, updated_at
                )
                VALUES (
                    $1,
                    $2, $3,
                    $4, $5,
                    $6, $7, $8,
                    $9, $10,
                    $11, $12,
                    $13, $14, $15,
                    $16, $17,
                    'approved', NOW(), NOW()
                )
                ON CONFLICT (user_id) DO UPDATE
                SET korean_std = EXCLUDED.korean_std,
                    korean_percentile = EXCLUDED.korean_percentile,
                    math_std = EXCLUDED.math_std,
                    math_percentile = EXCLUDED.math_percentile,
                    english_std = EXCLUDED.english_std,
                    english_percentile = EXCLUDED.english_percentile,
                    english_grade = EXCLUDED.english_grade,
                    explore1_std = EXCLUDED.explore1_std,
                    explore1_percentile = EXCLUDED.explore1_percentile,
                    explore2_std = EXCLUDED.explore2_std,
                    explore2_percentile = EXCLUDED.explore2_percentile,
                    history_std = EXCLUDED.history_std,
                    history_percentile = EXCLUDED.history_percentile,
                    history_grade = EXCLUDED.history_grade,
                    second_lang_std = EXCLUDED.second_lang_std,
                    second_lang_percentile = EXCLUDED.second_lang_percentile,
                    verified_status = 'approved',
                    verified_at = NOW(),
                    updated_at = NOW()`,
        [
          userId,
          approvedExamScores.korean_std,
          approvedExamScores.korean_percentile,
          approvedExamScores.math_std,
          approvedExamScores.math_percentile,
          approvedExamScores.english_std,
          approvedExamScores.english_percentile,
          approvedExamScores.english_grade,
          approvedExamScores.explore1_std,
          approvedExamScores.explore1_percentile,
          approvedExamScores.explore2_std,
          approvedExamScores.explore2_percentile,
          approvedExamScores.history_std,
          approvedExamScores.history_percentile,
          approvedExamScores.history_grade,
          approvedExamScores.second_lang_std,
          approvedExamScores.second_lang_percentile,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO exam_scores (user_id, verified_status, verified_at, updated_at)
                 VALUES ($1, 'approved', NOW(), NOW())
                 ON CONFLICT (user_id) DO UPDATE
                 SET verified_status = 'approved',
                     verified_at = COALESCE(exam_scores.verified_at, NOW()),
                     updated_at = NOW()`,
        [userId],
      );
    }

    await writeAdminAuditLog(client, {
      action: 'admin.approve_score',
      actorUserId: req.session.userId,
      targetUserId: userId,
      details: {
        before: beforeRes.rows[0],
        after: {
          score_status: 'approved',
          exam_scores: approvedExamScores,
        },
      },
    });

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback best-effort */
    }
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 성적 거부
router.post('/reject-score', requireAdmin, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const beforeRes = await client.query(
      'SELECT id, score_status, score_image_url FROM users WHERE id = $1',
      [user_id],
    );
    if (!beforeRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }

    await client.query(
      `UPDATE users SET score_status = 'rejected', score_image_url = NULL WHERE id = $1`,
      [user_id],
    );
    await client.query(
      `UPDATE exam_scores
             SET verified_status = 'rejected',
                 score_image_url = NULL,
                 updated_at = NOW()
             WHERE user_id = $1`,
      [user_id],
    );

    await writeAdminAuditLog(client, {
      action: 'admin.reject_score',
      actorUserId: req.session.userId,
      targetUserId: parseInt(user_id, 10),
      details: {
        before: beforeRes.rows[0],
        after: { score_status: 'rejected', score_image_url: null },
      },
    });

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback best-effort */
    }
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 내신 승인
router.post('/approve-gpa', requireAdmin, async (req, res) => {
  const { user_id, gpa } = req.body;
  const g = parseFloat(gpa);
  if (!user_id || isNaN(g) || g < 1.0 || g > 9.0) {
    return res.status(400).json({ error: '유저 ID와 내신 등급(1.0~9.0)을 확인해주세요.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const beforeRes = await client.query(
      'SELECT id, gpa_score, gpa_status FROM users WHERE id = $1',
      [user_id],
    );
    if (!beforeRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }

    await client.query(`UPDATE users SET gpa_score = $1, gpa_status = 'approved' WHERE id = $2`, [
      g,
      user_id,
    ]);

    await writeAdminAuditLog(client, {
      action: 'admin.approve_gpa',
      actorUserId: req.session.userId,
      targetUserId: parseInt(user_id, 10),
      details: {
        before: beforeRes.rows[0],
        after: { gpa_score: g, gpa_status: 'approved' },
      },
    });

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback best-effort */
    }
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 내신 거부
router.post('/reject-gpa', requireAdmin, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const beforeRes = await client.query(
      'SELECT id, gpa_status, gpa_image_url FROM users WHERE id = $1',
      [user_id],
    );
    if (!beforeRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }

    await client.query(
      `UPDATE users SET gpa_status = 'rejected', gpa_image_url = NULL WHERE id = $1`,
      [user_id],
    );

    await writeAdminAuditLog(client, {
      action: 'admin.reject_gpa',
      actorUserId: req.session.userId,
      targetUserId: parseInt(user_id, 10),
      details: {
        before: beforeRes.rows[0],
        after: { gpa_status: 'rejected', gpa_image_url: null },
      },
    });

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback best-effort */
    }
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 성적표 인증 대기 (exam_scores)
router.get('/pending-scores', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
            SELECT es.*, u.nickname, u.real_name, u.university
            FROM exam_scores es
            JOIN users u ON u.id = es.user_id
            WHERE es.verified_status = 'pending'
            ORDER BY es.updated_at DESC
        `);
    res.json({ submissions: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// 성적표 승인
router.post('/approve-exam-score', requireAdmin, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
  try {
    await pool.query(
      `UPDATE exam_scores SET verified_status = 'approved', verified_at = NOW() WHERE user_id = $1`,
      [user_id],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// 성적표 거부
router.post('/reject-exam-score', requireAdmin, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
  try {
    await pool.query(
      `UPDATE exam_scores SET verified_status = 'rejected', score_image_url = NULL WHERE user_id = $1`,
      [user_id],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
