const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { fileTypeFromBuffer } = require('file-type');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Middleware error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use(express.json());

// API key validation
function authenticate(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!process.env.API_KEYS) {
      throw new Error('API_KEYS environment variable not set');
    }
    const validKeys = process.env.API_KEYS.split(',');
    if (!apiKey || !validKeys.includes(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

app.post('/convert', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { quality = 80, format = 'webp' } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (quality < 1 || quality > 100) {
      return res.status(400).json({ error: 'Quality must be between 1-100' });
    }

    const type = await fileTypeFromBuffer(file.buffer);
    if (!type) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    let outputBuffer;
    const isAnimated = type.mime === 'image/gif';

    if (!isAnimated) {
      outputBuffer = await sharp(file.buffer)
        .webp({ 
          quality: parseInt(quality),
          lossless: false,
          effort: 6
        })
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
          .outputOptions([
            '-vf', 'colorkey=0x000000:0.1:0.1',
            '-movflags', 'faststart'
          ]);

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
    console.error('Conversion error:', error);
    res.status(500).json({ 
      error: 'Conversion failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Required environment variables:');
  console.log('- API_KEYS: comma-separated list of valid API keys');
});
