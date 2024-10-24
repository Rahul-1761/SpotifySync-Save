const express = require('express');
const session = require('express-session');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const ytSearch = require('yt-search');
const axios = require('axios');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Configure Spotify API credentials
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up session middleware
app.use(session({
    secret: 'SESSION_SECRET',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Home route
app.get('/', (req, res) => {
  res.render('index');
});

// Spotify authentication route
app.get('/login', (req, res) => {
  const authorizeURL = spotifyApi.createAuthorizeURL(['user-library-read', 'playlist-read-private'], 'state');
  res.redirect(authorizeURL);
});

// Spotify callback route
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    req.session.access_token = data.body.access_token;
    req.session.refresh_token = data.body.refresh_token;
    spotifyApi.setAccessToken(req.session.access_token);
    spotifyApi.setRefreshToken(req.session.refresh_token);
    res.redirect('/playlists');
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Authentication failed');
  }
});

// Fetch playlists
app.get('/playlists', async (req, res) => {
  try {
    if (!req.session.access_token) {
      return res.redirect('/login');
    }
    spotifyApi.setAccessToken(req.session.access_token);
    const data = await spotifyApi.getUserPlaylists();
    res.render('playlists', { playlists: data.body.items });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).send('Error fetching playlists');
  }
});

// Fetch playlist tracks
app.get('/playlist/:id', async (req, res) => {
  try {
    if (!req.session.access_token) {
      return res.redirect('/login');
    }
    spotifyApi.setAccessToken(req.session.access_token);
    const playlistId = req.params.id;
    const data = await spotifyApi.getPlaylistTracks(playlistId);
    res.render('playlist', { tracks: data.body.items, playlistId });
  } catch (error) {
    console.error('Error fetching playlist tracks:', error);
    res.status(500).send('Error fetching playlist tracks');
  }
});

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');


app.post('/download', async (req, res) => {
  const { tracks } = req.body;

  // Debugging output to check if tracks are received correctly
  console.log('Received tracks data:', tracks);

  let trackList;

  try {
      // Parse tracks data correctly (handles both strings and arrays)
      if (typeof tracks === 'string') {
          trackList = JSON.parse(tracks);
      } else {
          trackList = tracks;
      }

      if (!Array.isArray(trackList)) {
          if (trackList && typeof trackList === 'object') {
              trackList = [trackList];
          } else {
              throw new Error('Parsed tracks data is not an array');
          }
      }
  } catch (err) {
      console.error('Error parsing tracks:', err.message);
      return res.status(400).send('Invalid tracks data');
  }

  // Loop through each track and download it asynchronously
  for (const track of trackList) {
      const query = `${track.name} ${track.artist}`;
      
      try {
          console.log(`Searching YouTube for: ${query}`);
          const results = await ytSearch(query);

          if (!results || results.videos.length === 0) {
              console.error(`No results found for ${query}`);
              continue;
          }

          const videoUrl = results.videos[0].url;
          console.log(`Found video URL: ${videoUrl}`);

          // Fetch download link from the API
          const downloadLink = await fetchDownloadLink(videoUrl);
          if (!downloadLink) {
              console.error(`No download link found for ${track.name}`);
              continue;
          }

          console.log(`Download link: ${downloadLink}`);

          // Trigger the download process
          await downloadMusic(downloadLink, track.name);
          
      } catch (err) {
          console.error(`Error processing ${track.name}:`, err.message);
      }
  }

  res.send('Download process started (check logs for progress)');
});

// Function to fetch the download link
async function fetchDownloadLink(videoUrl) {
  const encodedUrl = encodeURIComponent(videoUrl);
  const apiUrl = `https://youtube-mp3-downloader2.p.rapidapi.com/ytmp3/ytmp3/long_video.php?url=${encodedUrl}`;
  
  const options = {
      method: 'GET',
      headers: {
          'x-rapidapi-key': process.env.YT_DOWNLOADER, // Replace with your API key
          'x-rapidapi-host': 'youtube-mp3-downloader2.p.rapidapi.com'
      }
  };

  try {
      const response = await fetch(apiUrl, options);
      const result = await response.json();
      return result.dlink; // Assuming the dlink is in the result object
  } catch (error) {
      console.error('Error fetching download link:', error);
      return null;
  }
}

// Function to download music in Node.js
async function downloadMusic(downloadLink, trackName) {
  try {
    // Make sure the downloads directory exists
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir);
    }

    const outputPath = path.join(downloadsDir, `${trackName}.mp3`);

    // Use axios to download the file as a stream
    const response = await axios({
      url: downloadLink,
      method: 'GET',
      responseType: 'stream'
    });

    // Create a writable stream to save the file
    const fileStream = fs.createWriteStream(outputPath);

    // Pipe the response stream to the file
    response.data.pipe(fileStream);

    // Return a promise that resolves when the download finishes
    return new Promise((resolve, reject) => {
      fileStream.on('finish', () => {
        console.log(`Successfully downloaded: ${trackName}`);
        resolve();
      });
      fileStream.on('error', (error) => {
        console.error(`Error downloading ${trackName}: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`Error downloading ${trackName}: ${error.message}`);
  }
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

