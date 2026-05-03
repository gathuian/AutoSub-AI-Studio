# AutoSub AI Studio

AI-powered real-time subtitles, caption styling, and lyric file generator.

## 🎯 Core Capabilities

- 🎤 **Real-time Subtitle Generation**: Powered by Gemini 2.0 Flash for high accuracy.
- 🎬 **Auto Captions**: Upload video/audio and get instant timestamps.
- 📝 **Script-Aware**: Provide a script to help the AI align text perfectly.
- 🎨 **Style Editor**: Customize fonts, colors, and positions.
- 🎵 **Lyric Lab**: Generate `.lrc` files for music players.
- 🎧 **DJ Tools**: BPM detection and video sync speed calculation.

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4, Motion.
- **AI**: Google Gemini API (`@google/genai`).
- **Audio**: `wavesurfer.js` for visualization.
- **Backend**: Express (Vite Proxy).

## 🚀 Getting Started

1. Set your `GEMINI_API_KEY` in the environment.
2. Run `npm install` and `npm run dev`.
3. Open the app and upload your first media file.

## 📁 Project Structure

- `/src/App.tsx`: Main application logic and UI.
- `/server.ts`: Express server for serving the app.
- `/BUTTONS_AND_FUNCTIONS.md`: Detailed user guide.
