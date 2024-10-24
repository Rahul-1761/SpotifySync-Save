const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

const videoUrl = 'https://youtube.com/watch?v=P4fzOSVy6-o';
const outputPath = path.join(downloadsDir, 'Sajde.mp4');

console.log(`Starting download of: ${videoUrl}`);

ytdl(videoUrl, { format: 'mp4' })
  .pipe(fs.createWriteStream(outputPath))
  .on('finish', () => {
    console.log('Download completed!');
  })
  .on('error', (err) => {
    console.error('Error downloading the video:', err.message);
  });
