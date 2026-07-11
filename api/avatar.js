// Proxies a user's real Telegram avatar via Bot API (token never leaves the server).
// GET /api/avatar?id=<telegram_user_id>
// 200 image/jpeg on success, 404 otherwise (frontend falls back to initials).

export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;
  const id = String(req.query.id || '').replace(/\D/g, '');
  if (!token || !id) return res.status(404).end();

  try {
    // 1. Latest profile photo
    const photosRes = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${id}&limit=1`
    );
    const photos = await photosRes.json();
    const sizes = photos?.result?.photos?.[0];
    if (!sizes?.length) return res.status(404).end();

    // Medium size is plenty for a 40-80px avatar (last = biggest)
    const fileId = (sizes[1] || sizes[sizes.length - 1]).file_id;

    // 2. Resolve file path
    const fileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const file = await fileRes.json();
    const filePath = file?.result?.file_path;
    if (!filePath) return res.status(404).end();

    // 3. Stream the bytes back (token stays server-side)
    const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!imgRes.ok) return res.status(404).end();
    const buf = Buffer.from(await imgRes.arrayBuffer());

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 24h cache
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[Avatar] error:', e.message);
    return res.status(404).end();
  }
}
