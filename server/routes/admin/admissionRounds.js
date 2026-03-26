const express = require('express');
const router = express.Router();
const { pool, requireAdmin, requireMainAdmin } = require('./_helpers');
const calc = require('../../utils/admissionCalc');

// 회차 목록
router.get('/rounds', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.nickname as created_by_nickname
             FROM admission_rounds r
             LEFT JOIN users u ON u.id = r.created_by
             ORDER BY r.created_at DESC LIMIT 50`,
    );
    res.json({ rounds: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// 회차 생성
router.post('/rounds', requireMainAdmin, async (req, res) => {
  const { name, exam_type, apply_start_at, apply_end_at, result_at } = req.body;
  if (!name || !exam_type) return res.status(400).json({ error: 'name, exam_type은 필수입니다.' });
  if (!['수능', '평가원', '교육청'].includes(exam_type)) {
    return res.status(400).json({ error: 'exam_type은 수능/평가원/교육청 중 하나여야 합니다.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO admission_rounds (name, exam_type, status, apply_start_at, apply_end_at, result_at, created_by)
             VALUES ($1,$2,'upcoming',$3,$4,$5,$6) RETURNING *`,
      [
        name,
        exam_type,
        apply_start_at || null,
        apply_end_at || null,
        result_at || null,
        req.session.userId,
      ],
    );
    res.json({ ok: true, round: result.rows[0] });
  } catch (err) {
    console.error('admin/rounds POST 오류:', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 회차 상태/일정 수정
router.patch('/rounds/:id', requireMainAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, status, apply_start_at, apply_end_at, result_at } = req.body;
  const validStatuses = ['upcoming', 'open', 'closed', 'announcing', 'announced', 'final'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 status입니다.' });
  }
  try {
    const result = await pool.query(
      `UPDATE admission_rounds
             SET name = COALESCE($2, name),
                 status = COALESCE($3, status),
                 apply_start_at = COALESCE($4, apply_start_at),
                 apply_end_at = COALESCE($5, apply_end_at),
                 result_at = COALESCE($6, result_at)
             WHERE id = $1 RETURNING *`,
      [
        id,
        name || null,
        status || null,
        apply_start_at || null,
        apply_end_at || null,
        result_at || null,
      ],
    );
    if (!result.rows[0]) return res.status(404).json({ error: '회차를 찾을 수 없습니다.' });
    res.json({ ok: true, round: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// 결과 발표 (정규분포 확률 기반 일괄 판정)
router.post('/rounds/:id/announce', requireMainAdmin, async (req, res) => {
  const roundId = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const roundRes = await client.query(`SELECT * FROM admission_rounds WHERE id = $1 FOR UPDATE`, [
      roundId,
    ]);
    const round = roundRes.rows[0];
    if (!round) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '회차를 찾을 수 없습니다.' });
    }
    if (!['closed', 'open'].includes(round.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '지원 마감 후에 결과를 발표할 수 있습니다.' });
    }

    // 전체 유저 수 (A 추정에 사용)
    const totalUsersRes = await client.query('SELECT COUNT(*) as cnt FROM users');
    const siteUserCount = parseInt(totalUsersRes.rows[0].cnt);

    // 대학+학과+군별로 묶어서 처리
    const appsRes = await client.query(
      `
            SELECT a.id, a.user_id, a.university, a.department, a.group_type,
                   es.korean_std, es.math_std, es.english_grade,
                   es.explore1_std, es.explore2_std, es.history_grade,
                   es.math_subject, es.explore1_subject, es.explore2_subject
            FROM applications a
            JOIN exam_scores es ON es.user_id = a.user_id
            WHERE a.round_id = $1 AND a.status = 'applied'
            ORDER BY a.university, a.department, a.group_type
        `,
      [roundId],
    );

    // 그룹핑: university+department+group_type
    const groups = {};
    for (const app of appsRes.rows) {
      const key = `${app.university}||${app.department || ''}||${app.group_type}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(app);
    }

    // 이전 회차 통계 (베이지안 A 추정용)
    const historyRes = await client.query(
      `
            SELECT university, department, group_type, estimated_A
            FROM admission_stats
            WHERE round_id != $1
            ORDER BY round_id DESC
        `,
      [roundId],
    );

    const historyMap = {};
    for (const h of historyRes.rows) {
      const key = `${h.university}||${h.department || ''}||${h.group_type}`;
      if (!historyMap[key]) historyMap[key] = [];
      historyMap[key].push(h);
    }

    let passedCount = 0;
    let failedCount = 0;

    for (const [key, apps] of Object.entries(groups)) {
      const [university, department, group_type] = key.split('||');
      const uni = require('../../data/universities').findUniversity(university);
      const basePercentile = uni ? uni.getPercentileForDept(department || '') : 50;

      // A 추정
      const history = historyMap[key] || [];
      const A = calc.estimateA(basePercentile, history);
      const V = apps.length;

      // 정원 추정
      const capacity = calc.estimateCapacity(basePercentile, siteUserCount);

      // 점수 순 정렬 (높은 순)
      apps.sort((a, b) => {
        const sa = calc.calcTotalStd(a);
        const sb = calc.calcTotalStd(b);
        return sb - sa;
      });

      let groupPassedCount = 0;

      // 각 지원자 R 계산 및 합불 판정
      for (let i = 0; i < apps.length; i++) {
        const app = apps[i];
        const r = i + 1; // 사이트 내 등수 (1부터)
        const R = calc.calcR(A, V, r);
        const passed = calc.drawResultByRank(R, capacity);

        await client.query(`UPDATE applications SET status = $1, result_at = NOW() WHERE id = $2`, [
          passed ? 'passed' : 'failed',
          app.id,
        ]);

        if (passed) {
          passedCount++;
          groupPassedCount++;
          await client.query(
            `INSERT INTO notifications (user_id, type, message)
                         VALUES ($1, 'admission_result', $2)`,
            [
              app.user_id,
              `🎉 ${university}${department ? ` ${department}` : ''} ${group_type}군 합격! 등록 기간 내 대학을 선택하세요.`,
            ],
          );
        } else {
          failedCount++;
          await client.query(
            `INSERT INTO notifications (user_id, type, message)
                         VALUES ($1, 'admission_result', $2)`,
            [
              app.user_id,
              `📋 ${university}${department ? ` ${department}` : ''} ${group_type}군 결과가 발표되었습니다.`,
            ],
          );
        }
      }

      // 통계 저장
      await client.query(
        `
                INSERT INTO admission_stats (round_id, university, department, group_type, site_applicants, estimated_A, accepted_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (round_id, university, department, group_type)
                DO UPDATE SET site_applicants=$5, estimated_A=$6, accepted_count=$7
            `,
        [roundId, university, department || null, group_type, V, A, groupPassedCount],
      );
    }

    // 추합 라운드 1~3차 생성
    for (let sub = 1; sub <= 3; sub++) {
      await client.query(
        `INSERT INTO supplementary_rounds (round_id, sub_round, status)
                 VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`,
        [roundId, sub],
      );
    }

    await client.query(`UPDATE admission_rounds SET status = 'announced' WHERE id = $1`, [roundId]);

    await client.query('COMMIT');
    res.json({ ok: true, passed: passedCount, failed: failedCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('admin/rounds/announce 오류:', err.message);
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 추합 트리거 (1~3차)
router.post('/rounds/:id/supplementary/:sub_round', requireMainAdmin, async (req, res) => {
  const roundId = parseInt(req.params.id);
  const subRound = parseInt(req.params.sub_round);
  if (![1, 2, 3].includes(subRound)) return res.status(400).json({ error: '추합은 1~3차입니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // declined (등록 포기) 된 자리 → failed 중 상위자 passed로 전환
    const declinedRes = await client.query(
      `
            SELECT university, department, group_type, COUNT(*) as declined_cnt
            FROM applications
            WHERE round_id = $1 AND status = 'declined'
            GROUP BY university, department, group_type
        `,
      [roundId],
    );

    let supplementCount = 0;

    const totalUsersRes = await client.query('SELECT COUNT(*) as cnt FROM users');
    const siteUserCount = parseInt(totalUsersRes.rows[0].cnt);

    for (const row of declinedRes.rows) {
      const { university, department, group_type, declined_cnt } = row;
      const uni = require('../../data/universities').findUniversity(university);
      const basePercentile = uni ? uni.getPercentileForDept(department || '') : 50;
      const capacity = calc.estimateCapacity(basePercentile, siteUserCount);

      // 같은 대학+학과+군에서 failed 상태인 지원자를 점수 순으로 가져옴
      const candidatesRes = await client.query(
        `
                SELECT a.id, a.user_id, a.university, a.department, a.group_type,
                       es.korean_std, es.math_std, es.explore1_std, es.explore2_std
                FROM applications a
                JOIN exam_scores es ON es.user_id = a.user_id
                                WHERE a.round_id = $1 AND a.university = $2
                                    AND COALESCE(a.department, '') = COALESCE($3, '') AND a.group_type = $4
                  AND a.status = 'failed'
                ORDER BY (COALESCE(es.korean_std,0) + COALESCE(es.math_std,0) +
                          COALESCE(es.explore1_std,0) + COALESCE(es.explore2_std,0)) DESC
                                LIMIT $5
                        `,
        [roundId, university, department || '', group_type, parseInt(declined_cnt)],
      );

      for (const candidate of candidatesRes.rows) {
        // 추합도 확률 판정 (여유있게 75%)
        if (!calc.drawResult(0.75)) continue;

        await client.query(
          `UPDATE applications SET status = 'passed', result_at = NOW() WHERE id = $1`,
          [candidate.id],
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, message)
                     VALUES ($1, 'supplementary', $2)`,
          [
            candidate.user_id,
            `🎊 ${university}${department ? ` ${department}` : ''} ${group_type}군 ${subRound}차 추가합격! 오늘 안에 등록 여부를 결정해주세요.`,
          ],
        );
        supplementCount++;
      }
    }

    await client.query(
      `UPDATE supplementary_rounds SET status = 'announced', closed_at = NOW()
             WHERE round_id = $1 AND sub_round = $2`,
      [roundId, subRound],
    );

    await client.query('COMMIT');
    res.json({ ok: true, supplemented: supplementCount, sub_round: subRound });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('admin/supplementary 오류:', err.message);
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 회차 통계
router.get('/rounds/:id/stats', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM admission_stats WHERE round_id = $1 ORDER BY university, group_type`,
      [req.params.id],
    );
    res.json({ stats: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
