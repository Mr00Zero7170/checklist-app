# Checklist App

> A lightweight, offline-first PWA for building better habits—one check at a time.

## What This Is

**Checklist App** is a minimalist daily checklist application built as a Progressive Web App (PWA). Install it on your Android device, and it works completely offline with full-screen, native-app feel. Your progress is saved locally on your phone, giving you complete privacy and ownership of your data.

Built with vanilla JavaScript, HTML, and TypeScript—no frameworks, no bloat, just what you need.

---

## Why I Built This

Productivity tools are everywhere, but most of them are overcomplicated, require internet, or want your data in the cloud. I wanted something different: a tool that respects your autonomy, works offline, and actually encourages consistency without dark patterns or notifications.

This project taught me that **simplicity is powerful**. Building a checklist might sound trivial, but creating something that works offline, installs like a native app, and syncs seamlessly across sessions requires understanding service workers, caching strategies, and Progressive Web App fundamentals. 

More importantly, **this app exists because I wanted to solve a real problem in my own life**—keeping track of daily habits and visualizing streaks. When you build tools for yourself, the design decisions come naturally.

---

## Features

- ✅ **Offline-First**: Works without internet after the first load
- 📱 **Installable**: Installs on Android like a native app (via Chrome)
- 🎨 **Minimal UI**: Clean, distraction-free interface
- 💾 **Local Storage**: All your data stays on your phone
- 🔄 **PWA Ready**: Service worker handles updates and caching
- 📊 **Streak Tracking**: Visualize your consistency over time
- 🚀 **Fast**: No external dependencies, instant load times

---

## Quick Start

### Deploy It (5 Minutes)

1. **Create a public GitHub repository** (or use this one as a template):
   ```bash
   git clone https://github.com/Mr00Zero7170/checklist-app
   cd checklist-app
   ```

2. **Push to GitHub** (if forking/customizing):
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Enable GitHub Pages**:
   - Go to your repository **Settings** → **Pages**
   - Source: "Deploy from a branch"
   - Branch: `main`, Folder: `/` (root)
   - Save

4. **Your app is live** at: `https://<your-username>.github.io/checklist/`

### Install on Your Phone

1. Open the link in **Chrome** on your Android device
2. Tap the menu (⋮) → **"Install app"** (or **"Add to Home screen"**)
3. Open it from your home screen—it runs full screen, works offline

---

## How It Works

```
├── index.html          # Main app (HTML + inline styles)
├── sw.js              # Service Worker (offline support & caching)
├── manifest.webmanifest  # PWA metadata & icons
└── icons/             # App icons for different devices
```

**Key Technologies:**
- **Service Worker**: Caches assets on first load, enables offline mode
- **Local Storage API**: Persists your checklist and streak data
- **Web App Manifest**: Makes it installable and native-feeling
- **Vanilla JavaScript**: No frameworks—just pure, performant code

---

## Customization

### Update Your Checklist Items
Edit `index.html` and modify the checklist items in the HTML. 

### Change Colors & Style
All styles are inline in `index.html` for simplicity. Customize the CSS variables and colors as you like.

### Deploy Updates
After making changes, **bump the cache version** in `sw.js`:

```javascript
// Change this:
const CACHE_NAME = 'daily-checklist-v1';

// To this:
const CACHE_NAME = 'daily-checklist-v2';
```

This forces phones to download the latest version on their next visit.

---

## Technical Details

### Why PWA?
- **No app store**: Distribute instantly via a link
- **Works offline**: Service worker caches everything
- **Native experience**: Installs and runs full-screen
- **Your data is yours**: Everything stays on the device

### Why Vanilla JS?
- **No dependencies**: Nothing to maintain or update
- **Small footprint**: Fast loads even on slow connections
- **Clear code**: Easy to understand and modify
- **Educational**: Great for learning how PWAs actually work

---

## Deployment Alternatives

Not using GitHub Pages? No problem:
- **Netlify Drop**: Drag and drop your folder
- **Cloudflare Pages**: Connect your GitHub repo
- **Vercel**: Zero-config deployment
- **Your own server**: Copy files anywhere HTTP is served

---

## What's Next?

Potential improvements:
- [ ] Multiple categories/lists
- [ ] Dark mode toggle
- [ ] Data export/backup
- [ ] Sync across devices (optional cloud backup)
- [ ] Recurring tasks scheduler

---

## License

Feel free to fork, modify, and use this however you like. No license restrictions.

---

## Get In Touch

Found a bug? Have an idea? This repo is a reflection of my commitment to building simple, useful tools. Feedback is always welcome—open an issue or reach out.

---

**Built with ❤️ by Mr00Zero7170**

*A reminder that the best productivity tool is the one you'll actually use.*
