import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
    const musicDir = path.join(process.cwd(), 'music');

    // Check if directory exists
    if (!fs.existsSync(musicDir)) {
        console.warn(`Music directory not found at: ${musicDir}`);
        return res.json([]);
    }

    try {
        const files = fs.readdirSync(musicDir);

        // Filter for audio files
        const audioFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext);
        });

        res.status(200).json(audioFiles);
    } catch (error) {
        console.error('Error reading music directory:', error);
        res.status(500).json({ error: 'Failed to read music directory' });
    }
}
