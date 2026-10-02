Daily checklist: installable Android app (PWA)

HOST IT (free, about 5 minutes) with GitHub Pages
1. Create a new public repository on GitHub, e.g. "checklist".
2. Upload everything in this folder (index.html, sw.js, manifest.webmanifest,
   and the icons folder) to the repository root.
3. Repository Settings > Pages > Source: "Deploy from a branch",
   Branch: main, folder: / (root). Save.
4. After a minute your app is live at https://<your-username>.github.io/checklist/

INSTALL ON ANDROID
1. Open that link in Chrome on your phone.
2. Chrome menu (three dots) > "Install app" (or "Add to Home screen").
3. Open it from your home screen. It runs full screen and works offline.

NOTES
- Your ticks, streak and book progress are saved on the phone, inside the installed app.
- If you change any file later, bump CACHE in sw.js (daily-checklist-v1 to v2)
  so phones pick up the update.
- Other free hosts also work: Netlify Drop, Cloudflare Pages, Vercel.
