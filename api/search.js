const CryptoJS = require('crypto-js');

function decryptDES(encryptedUrl) {
    try {
        const key = CryptoJS.enc.Utf8.parse('38346591');
        const decrypted = CryptoJS.DES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
            key,
            {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error("DES decrypt failed", e);
        return null;
    }
}

function forceMaxQuality(url) {
    if (!url) return '';
    return url.replace(/_(12|48|96|160)\.(mp4|m4a)/g, '_320.$2');
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

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

    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ error: 'Missing query parameter q' });
    }

    try {
        const query = encodeURIComponent(q);
        // Step 1: Search for tracks
        const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&includeMetaTags=1&q=${query}&n=20`;
        
        const searchRes = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://www.jiosaavn.com/'
            }
        });

        if (!searchRes.ok) {
            return res.status(502).json({ error: 'JioSaavn search request failed' });
        }

        const searchData = await searchRes.json();
        const results = searchData.results || [];
        if (results.length === 0) {
            return res.status(200).json([]);
        }

        // Step 2: Get song details in batch (pids)
        const pids = results.map(item => item.id).join(',');
        const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&_marker=0&cc=in&pids=${pids}`;
        
        const detailsRes = await fetch(detailsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://www.jiosaavn.com/'
            }
        });

        if (!detailsRes.ok) {
            return res.status(502).json({ error: 'JioSaavn details request failed' });
        }

        const detailsData = await detailsRes.json();
        
        // Step 3: Format and decrypt songs
        const songs = results.map(item => {
            const detail = detailsData[item.id] || {};
            
            // Decrypt stream URL
            let streamUrl = '';
            if (detail.media_url) {
                streamUrl = forceMaxQuality(detail.media_url);
            } else if (detail.encrypted_media_url) {
                const decrypted = decryptDES(detail.encrypted_media_url);
                if (decrypted) {
                    streamUrl = forceMaxQuality(decrypted);
                }
            }

            const singers = item.singers || item.primary_artists || 'Unknown Artist';
            const highResImage = (item.image || '')
                .replace('150x150', '500x500')
                .replace('50x50', '500x500')
                .replace('-150.jpg', '-500.jpg')
                .replace('-50.jpg', '-500.jpg');

            const durSec = parseInt(detail.duration || item.duration || '0', 10);
            const durationMs = durSec * 1000;
            const minutes = Math.floor(durSec / 60);
            const seconds = durSec % 60;
            const durationText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

            return {
                id: item.id,
                title: cleanHtml(item.song || 'Unknown Title'),
                artist: cleanHtml(singers),
                durationText,
                durationMs,
                thumbnailUrl: highResImage,
                streamUrl
            };
        }).filter(song => song.streamUrl); // filter out songs that couldn't be resolved

        return res.status(200).json(songs);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
