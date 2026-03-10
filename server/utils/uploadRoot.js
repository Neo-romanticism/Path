const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = process.env.UPLOAD_ROOT
    ? path.resolve(process.env.UPLOAD_ROOT)
    : path.join(__dirname, '../../uploads');

function getUploadDir(...segments) {
    const dir = path.join(UPLOAD_ROOT, ...segments);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

module.exports = {
    UPLOAD_ROOT,
    getUploadDir,
};
