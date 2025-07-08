const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const FileType = require('file-type');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/convert', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { quality = 80, format = 'webp' } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const type = await FileType.fromBuffer(file.buffer);
    if (!type) return res.status(400).json({ error: 'Unsupported file type' });

    let outputBuffer;
    const isAnimated = type.mime === 'image/gif';

    if (!isAnimated) {
      outputBuffer = await sharp(file.buffer)
        .webp({ quality: parseInt(quality), lossless: false, effort: 6 })
        .toBuffer();
    } else {
      const tempDir = '/tmp';
      const inputExt = type.ext || 'gif';
      const outputExt = format === 'mp4' ? 'mp4' : 'webp';
      const tempInput = path.join(tempDir, `input.${inputExt}`);
      const tempOutput = path.join(tempDir, `output.${outputExt}`);

      fs.writeFileSync(tempInput, file.buffer);

      await new Promise((resolve, reject) => {
        const command = ffmpeg(tempInput)
          .output(tempOutput)
          .outputOptions(['-vf', 'colorkey=0x000000:0.1:0.1']);

        if (outputExt === 'webp') {
          command.outputOptions([
            '-c:v', 'libvpx-vp9',
            '-b:v', '0',
            '-crf', String(Math.round(63 - (quality * 0.63)))
          ]);
        } else {
          command.outputOptions([
            '-c:v', 'libx264',
            '-crf', String(Math.round(51 - (quality * 0.51)))
          ]);
        }

        command
          .on('end', () => {
            outputBuffer = fs.readFileSync(tempOutput);
            fs.unlinkSync(tempInput);
            fs.unlinkSync(tempOutput);
            resolve();
          })
          .on('error', reject)
          .run();
      });
    }

    res.set('Content-Type', format === 'mp4' ? 'video/mp4' : 'image/webp');
    res.send(outputBuffer);
  } catch (error) {
    console.error('Conversion error:', error.message);
    res.status(500).json({ error: 'Conversion failed', details: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
