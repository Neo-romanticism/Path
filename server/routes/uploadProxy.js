const express = require('express');
const router = express.Router();
const { getUploadDir } = require('../utils/uploadRoot');

function setPrivateNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

router.use('/uploads/scores/:filename', (req, res) => {
  setPrivateNoStore(res);
  res.redirect(`/api/auth/score-image/${req.params.filename}`);
});
router.use('/uploads/gpa/:filename', (req, res) => {
  setPrivateNoStore(res);
  res.redirect(`/api/auth/gpa-image/${req.params.filename}`);
});
router.use('/uploads/profiles/:filename', (req, res) => {
  setPrivateNoStore(res);
  res.redirect(`/api/auth/profile-image/${req.params.filename}`);
});
router.use('/uploads/messages/:filename', (req, res) => {
  setPrivateNoStore(res);
  res.redirect(`/api/messages/file/${req.params.filename}`);
});
router.use('/uploads/study-proofs/:filename', (req, res) => {
  setPrivateNoStore(res);
  res.redirect(`/api/study/proof-image/${req.params.filename}`);
});
router.use(
  '/uploads/community',
  express.static(getUploadDir('community'), {
    maxAge: '30d',
    etag: true,
  }),
);

module.exports = router;
