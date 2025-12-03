export default function handler(req, res) {
    // In production (Vercel), music files are served from /music/ as static assets
    // This API just returns the list of known music files
    // The files themselves are served directly by Vercel's CDN

    const musicFiles = [
        'Paul Wall - Sittin\' Sidewayz ft. Big Pokey (Official Video).mp3',
        'Pop Smoke - Aim For The Moon (Official Music Video) ft. Quavo.mp3',
        'Rich The Kid - Plug Walk (Audio).mp3'
    ];

    res.status(200).json(musicFiles);
}
