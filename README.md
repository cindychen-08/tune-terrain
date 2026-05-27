# Tune Terrain

Visualize your Spotify listening habits through interactive charts and networks.

## Features

- **Top Tracks** — See your most played songs ranked
- **Song Network** — Explore connections between your music, colored by artist
- **Top Artists** — Discover which artists dominate your listening
- **Time Range** — Switch between 4 weeks, 6 months, or all time data
- **Interactive** — Zoom, pan, and hover for details

## Tech Stack

- Vanilla JavaScript
- D3.js for visualizations
- Spotify Web API
- OAuth 2.0 with PKCE

## Setup

1. Clone this repository
2. Create a Spotify app at [developer.spotify.com](https://developer.spotify.com)
3. Add `http://127.0.0.1:5500/callback.html` as a Redirect URI
4. Copy your Client ID into `app.js` and `callback.html`
5. Open with Live Server in VS Code

## Privacy

This app only reads your listening history. Nothing is stored or shared.
