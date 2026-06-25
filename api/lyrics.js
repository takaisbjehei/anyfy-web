module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { title, artist, duration } = req.query;
    if (!title || !artist) {
        return res.status(400).json({ error: 'Missing title or artist parameter' });
    }

    try {
        const encodedTitle = encodeURIComponent(title);
        const encodedArtist = encodeURIComponent(artist);
        let url = `https://lrclib.net/api/get?track_name=${encodedTitle}&artist_name=${encodedArtist}`;
        if (duration) {
            const durSec = Math.round(parseInt(duration, 10) / 1000);
            if (!isNaN(durSec) && durSec > 0) {
                url += `&duration=${durSec}`;
            }
        }

        const lrcRes = await fetch(url, {
            headers: {
                'User-Agent': 'AnyfyPlayerWeb/1.0 (https://github.com/takaisbjehei/anyfy-web)'
            }
        });

        if (!lrcRes.ok) {
            // If not found or failed, return empty list
            return res.status(200).json([]);
        }

        const data = await lrcRes.json();
        
        // Parse LRC format
        const parseLrc = (lrcContent) => {
            if (!lrcContent) return [];
            const lines = [];
            const regex = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;
            lrcContent.split('\n').forEach(line => {
                const match = regex.exec(line.trim());
                if (match) {
                    const mins = parseInt(match[1], 10);
                    const secs = parseFloat(match[2]);
                    const text = match[3].trim();
                    const timeMs = Math.round((mins * 60 + secs) * 1000);
                    lines.push({ timeMs, text });
                }
            });
            return lines.sort((a, b) => a.timeMs - b.timeMs);
        };

        if (data.syncedLyrics) {
            const parsed = parseLrc(data.syncedLyrics);
            if (parsed.length > 0) {
                return res.status(200).json(parsed);
            }
        }

        if (data.plainLyrics) {
            const lines = data.plainLyrics.split('\n')
                .map((line, i) => ({
                    timeMs: i * 3500,
                    text: line.trim()
                }))
                .filter(line => line.text.length > 0);
            return res.status(200).json(lines);
        }

        return res.status(200).json([]);
    } catch (error) {
        console.error(error);
        return res.status(200).json([]); // Always return empty array instead of failing
    }
}
