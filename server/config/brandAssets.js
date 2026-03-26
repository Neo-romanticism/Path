const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');

const brandAssetMap = Object.freeze({
  'app-icon-master-1024.png': path.join(projectRoot, 'icons', 'IMG_0219.png'),
  'app-icon-alt-square-1024.png': path.join(
    projectRoot,
    'icons',
    '\u1106\u116e\u110c\u116611_20260310203802.png',
  ),
  'splash-landscape-a-1408x768.png': path.join(
    projectRoot,
    'icons',
    '\u1106\u116e\u110c\u116612_20260310204735.png',
  ),
  'splash-landscape-b-1408x768.png': path.join(
    projectRoot,
    'icons',
    '\u1106\u116e\u110c\u116612_20260310204810.png',
  ),
  'promo-preview.mp4': path.join(projectRoot, 'icons', 'gemini_generated_video_29ABE2A4.mp4'),
});

const appIconSourcePath = brandAssetMap['app-icon-master-1024.png'];

module.exports = { projectRoot, brandAssetMap, appIconSourcePath };
