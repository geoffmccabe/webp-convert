const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const FileType = require('file-type');
const fs = require('fs');
const path = require('path');
const Queue = require('bull');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// Redis queue with error handling
const convertQueue = new Queue('image-conversion', {
  redis: { 
    host: process.env.REDIS_HOST || 'localhost', 
    port: parseInt(process.env.REDIS_PORT) || 6379 
  }
});

convertQueue.on('error', (error) => {
  console.error('Queue error:', error.message);
});

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

    const job = await convertQueue.add({ file: file.buffer, quality, format }, {
      timeout: 60000 // 60s timeout for job
    });
    res.json({ jobId: job.id, status: 'queued' });
  } catch (error) {
    console.error('Queue error:', error.message);
    res.status(500).json({ error: 'Failed to queue conversion', details: error.message });
  }
});

convertQueue.process(async (job, done) => {
  const tempDir = '/tmp';
  const tempInput = path.join(tempDir, `input-${job.id}.tmp`);
  const tempOutput = path.join(tempDir, `output-${job.id}.tmp`);
  try {
    const { file, quality, format } = job.data;
    const type = await FileType.fromBuffer(file);
    if (!type) throw new Error('Unsupported file type');

    let outputBuffer;
    const isAnimated = type.mime === 'image/gif';
    const outputExt = format === 'mp4' ? 'mp4' : 'webp';

    fs.writeFileSync(tempInput, file);

    if (!isAnimated) {
      outputBuffer = await sharp(file)
        .webp({ quality: parseInt(quality), lossless: false, effort: 6 })
        .toBuffer();
      fs.writeFileSync(tempOutput, outputBuffer);
    } else {
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
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      outputBuffer = fs.readFileSync(tempOutput);
    }

    fs.writeFileSync(tempOutput, outputBuffer);
    done(null, { outputPath: tempOutput, format: outputExt });
  } catch (error) {
    done(error);
  } finally {
    // Clean up temporary files
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
  }
});

app.get('/result/:jobId', authenticate, async (req, res) => {
  try {
    const job = await convertQueue.getJob(req.params.jobId);
    if (!job || !job.returnvalue) return res.status(404).json({ error: 'Job not found or not completed' });

    const { outputPath, format } = job.returnvalue;
    if (!fs.existsSync(outputPath)) return res.status(404).json({ error: 'Output file not found' });

    const outputBuffer = fs.readFileSync(outputPath);
    res.set('Content-Type', format === 'mp4' ? 'video/mp4' : 'image/webp');
    res.send(outputBuffer);
    fs.unlinkSync(outputPath); // Clean up
  } catch (error) {
    console.error('Result error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve result', details: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
