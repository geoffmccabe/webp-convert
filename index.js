const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { fromBuffer } = require('file-type');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// Middleware to verify API key
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validKeys = process.env.API_KEYS.split(',');
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/convert', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { quality } = req.body; // Compression quality (0-100)
    const file = req.file;
    if (!file || !quality) return res.status(400).json({ error: 'Missing file or quality' });

    const fileType = await fromBuffer(file.buffer);
    const isAnimated = fileType?.mime === 'image/gif';
    let outputBuffer;
    let outputFormat = req.body.format || 'webp'; // Default to WebP

    if (!isAnimated) {
      // Static image conversion
      outputBuffer = await sharp(file.buffer)
        .webp({ quality: parseInt(quality), lossless: false, effort: 6 })
        .toBuffer();
    } else {
      // Animated image conversion (WebP or MP4)
      const tempInput = `/tmp/input.${fileType.ext}`;
      const tempOutput = `/tmp/output.${outputFormat}`;

      require('fs').writeFileSync(tempInput, file.buffer);

      await new Promise((resolve, reject) => {
        let command = ffmpeg(tempInput)
          .output(tempOutput)
          .outputOptions(['-vf colorkey=0x000000:0.1:0.1']); // Preserve transparency

        if (outputFormat === 'webp') {
          command
            .outputOptions(['-c:v libvpx-vp9', '-b:v 0', `-crf ${Math.round(63 - (quality * 0.63))}`]);
        } else if (outputFormat === 'mp4') {
          command
            .outputOptions(['-c:v libx264', `-crf ${Math.round(51 - (quality * 0.51))}`]);
        }

        command
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      outputBuffer = require('fs').readFileSync(tempOutput);
      require('fs').unlinkSync(tempInput);
      require('fs').unlinkSync(tempOutput);
    }

    res.setHeader('Content-Type', outputFormat === 'mp4' ? 'video/mp4' : 'image/webp');
    res.send(outputBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Conversion failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
