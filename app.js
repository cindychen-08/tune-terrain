const CLIENT_ID = 'fc52d19b38c34744a7e469bcaacfaeb8';
const REDIRECT_URI = 'http://127.0.0.1:5500/callback.html';
const SCOPES = 'user-top-read user-read-recently-played user-library-read';

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginBtn = document.getElementById('login-btn');
const userInfo = document.getElementById('user-info');
const loading = document.getElementById('loading');
const vizContainer = document.getElementById('visualization');
const navBtns = document.querySelectorAll('.nav-btn');
const timeBtns = document.querySelectorAll('.time-btn');

// State
let accessToken = localStorage.getItem('spotify_token');
let userData = null;
let topTracks = [];
let audioFeatures = [];
let currentTimeRange = 'medium_term';
let currentViz = 'topology';

// Color palette
const colors = {
  primary: '#2d7a6d',
  secondary: '#7c5cbf',
  accent: '#d4a574',
  nodes: ['#2d7a6d', '#7c5cbf', '#d4a574', '#e07a7a', '#5b8fd4']
};

// Initialize
init();

function init() {
  if (accessToken) {
    showApp();
    loadData();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
}

// PKCE Helper Functions
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(codeVerifier) {
  const hashed = await sha256(codeVerifier);
  return base64urlencode(hashed);
}

// Spotify Auth with PKCE
loginBtn.addEventListener('click', async () => {
  const codeVerifier = generateRandomString(64);
  localStorage.setItem('code_verifier', codeVerifier);
  
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge
  });
  
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
});

// Time range selector
timeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    timeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTimeRange = btn.dataset.range;
    loadData();
  });
});

// Fetch from Spotify API
async function fetchSpotify(endpoint) {
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (response.status === 401) {
    localStorage.removeItem('spotify_token');
    accessToken = null;
    showLogin();
    return null;
  }
  
  if (response.status === 403) {
    console.log('Access forbidden for endpoint:', endpoint);
    return null;
  }
  
  return response.json();
}

// Load all data
async function loadData() {
  loading.classList.remove('hidden');
  vizContainer.innerHTML = '';

  try {
    userData = await fetchSpotify('/me');
    if (userData) {
      userInfo.innerHTML = `<span>Hello, ${userData.display_name}</span>
        <button id="logout-btn" class="btn-secondary">Logout</button>`;
      document.getElementById('logout-btn').addEventListener('click', logout);
    }

    const topTracksData = await fetchSpotify(`/me/top/tracks?limit=50&time_range=${currentTimeRange}`);
    if (topTracksData && topTracksData.items) {
      topTracks = topTracksData.items;
    }

    // Update stats
    const uniqueArtists = new Set(topTracks.flatMap(t => t.artists.map(a => a.id)));
    document.getElementById('track-count').textContent = topTracks.length;
    document.getElementById('artist-count').textContent = uniqueArtists.size;

    // Try to get audio features (may fail with 403)
    if (topTracks.length > 0) {
      const trackIds = topTracks.map(t => t.id).join(',');
      try {
        const featuresData = await fetchSpotify(`/audio-features?ids=${trackIds}`);
        if (featuresData && featuresData.audio_features) {
          audioFeatures = featuresData.audio_features;
        }
      } catch (e) {
        console.log('Audio features not available:', e);
        audioFeatures = [];
      }
    }

    loading.classList.add('hidden');
    
    if (topTracks.length === 0) {
      vizContainer.innerHTML = '<p style="text-align:center;padding:40px;color:#737373;">No listening data found. Listen to more music on Spotify and try again!</p>';
      return;
    }
    
    // Show current visualization
    if (currentViz === 'topology') showTopologyMap();
    else if (currentViz === 'network') showNetwork();
    else if (currentViz === 'fingerprint') showFingerprint();

  } catch (error) {
    console.error('Error loading data:', error);
    loading.innerHTML = '<p>Error loading data. Please try again.</p>';
  }
}

function logout() {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('code_verifier');
  accessToken = null;
  showLogin();
}

// Navigation
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    currentViz = btn.dataset.viz;
    if (currentViz === 'topology') showTopologyMap();
    else if (currentViz === 'network') showNetwork();
    else if (currentViz === 'fingerprint') showFingerprint();
  });
});

// Helper: Get color for artist
function getArtistColor(artistId, artistMap) {
  if (!artistMap.has(artistId)) {
    artistMap.set(artistId, colors.nodes[artistMap.size % colors.nodes.length]);
  }
  return artistMap.get(artistId);
}

// ============ VISUALIZATION 1: Top Tracks ============
function showTopologyMap() {
  const timeRangeLabels = {
    'short_term': 'the last 4 weeks',
    'medium_term': 'the last 6 months',
    'long_term': 'all time'
  };

  vizContainer.innerHTML = `
    <div class="section-header">
      <h3>Your Top Tracks</h3>
      <p>Based on ${timeRangeLabels[currentTimeRange]}</p>
    </div>
    <div class="track-list">
      ${topTracks.slice(0, 20).map((t, i) => `
        <div class="track-item">
          <span class="track-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</span>
          <img class="track-image" src="${t.album.images[2]?.url || ''}" alt="">
          <div class="track-info">
            <div class="track-name">${t.name}</div>
            <div class="track-artist">${t.artists.map(a => a.name).join(', ')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============ VISUALIZATION 2: Song Network with Zoom ============
function showNetwork() {
  vizContainer.innerHTML = `
    <div class="network-controls">
      <button class="zoom-btn" id="zoom-in">+</button>
      <button class="zoom-btn" id="zoom-out">−</button>
      <button class="zoom-btn" id="zoom-reset">↺</button>
    </div>
    <div id="network-graph"></div>
  `;
  
  const width = vizContainer.clientWidth;
  const height = 480;

  const svg = d3.select('#network-graph')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Create a group for zoom/pan
  const g = svg.append('g');

  // Set up zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.3, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Zoom controls
  document.getElementById('zoom-in').addEventListener('click', () => {
    svg.transition().call(zoom.scaleBy, 1.3);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    svg.transition().call(zoom.scaleBy, 0.7);
  });
  document.getElementById('zoom-reset').addEventListener('click', () => {
    svg.transition().call(zoom.transform, d3.zoomIdentity);
  });

  // Create artist color map
  const artistColorMap = new Map();

  const nodes = topTracks.slice(0, 40).map((track, i) => ({
    id: track.id,
    name: track.name,
    artist: track.artists[0].name,
    artistId: track.artists[0].id,
    image: track.album.images[2]?.url,
    color: getArtistColor(track.artists[0].id, artistColorMap)
  }));

  // Create links - by same artist
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].artistId === nodes[j].artistId) {
        links.push({ source: nodes[i].id, target: nodes[j].id });
      }
    }
  }

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(60))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(15));

  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('class', 'network-link');

  const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

  const node = g.append('g')
    .selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('r', 12)
    .attr('class', 'network-node')
    .attr('fill', d => d.color)
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
    .on('mouseover', (event, d) => {
      tooltip.transition().duration(200).style('opacity', 1);
      tooltip.html(`<strong>${d.name}</strong><br>${d.artist}`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition().duration(500).style('opacity', 0);
    });

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
  });

  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  // Add legend
  const legendArtists = [...artistColorMap.entries()].slice(0, 5);
  const legend = svg.append('g')
    .attr('transform', `translate(20, ${height - 20 - legendArtists.length * 20})`);

  legendArtists.forEach(([artistId, color], i) => {
    const artistName = nodes.find(n => n.artistId === artistId)?.artist || 'Unknown';
    
    legend.append('circle')
      .attr('cx', 0)
      .attr('cy', i * 20)
      .attr('r', 6)
      .attr('fill', color);
    
    legend.append('text')
      .attr('x', 14)
      .attr('y', i * 20 + 4)
      .attr('font-size', '11px')
      .attr('fill', '#737373')
      .text(artistName.length > 20 ? artistName.slice(0, 20) + '...' : artistName);
  });
}

// ============ VISUALIZATION 3: Top Artists ============
function showFingerprint() {
  // Count tracks per artist
  const artistCounts = {};
  topTracks.forEach(track => {
    const artist = track.artists[0].name;
    const artistId = track.artists[0].id;
    if (!artistCounts[artist]) {
      artistCounts[artist] = { count: 0, id: artistId };
    }
    artistCounts[artist].count++;
  });
  
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const timeRangeLabels = {
    'short_term': 'the last 4 weeks',
    'medium_term': 'the last 6 months',
    'long_term': 'all time'
  };

  vizContainer.innerHTML = `
    <div class="section-header">
      <h3>Your Top Artists</h3>
      <p>Based on ${timeRangeLabels[currentTimeRange]}</p>
    </div>
    <div class="artist-list">
      ${topArtists.map(([artist, data], i) => `
        <div class="artist-item">
          <div class="artist-left">
            <span class="artist-rank">#${i + 1}</span>
            <span class="artist-name">${artist}</span>
          </div>
          <span class="artist-count">${data.count} ${data.count === 1 ? 'track' : 'tracks'}</span>
        </div>
      `).join('')}
    </div>
  `;
}