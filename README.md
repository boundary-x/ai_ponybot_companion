# 🐾 Boundary X — AI Ponybot Companion

**AI Ponybot Companion** turns a smartphone into the expressive face of an **AI Ponybot**. PONI responds with original pixel eyes, synthesized robot sounds, and optional four-motor gestures.

![Status](https://img.shields.io/badge/Status-Preview-76956b)
![Platform](https://img.shields.io/badge/Platform-Frontend%20Web-222222)
![Stack](https://img.shields.io/badge/Stack-Canvas%20%7C%20Web%20Audio%20%7C%20BLE-9ed4a5)

**[Open the Web App](https://boundary-x.github.io/ai_ponybot_companion/)**

**[GitHub Repository](https://github.com/boundary-x/ai_ponybot_companion)**

---

## ✨ Key Features

### 1. Pixel Personality
- Original Canvas pixel artwork: curious, happy, affectionate, surprised, sleepy, calm, listening, and thinking.
- Gaze movement, blinks, subtle idle animation, and touch reactions.
- Procedural electronic sounds; no human speech synthesis.
- Small variations in local gestures and sound pitch. Reduced-motion preference supported.
- Full-screen robot face, with a CSS fallback for browsers without Fullscreen support.

### 2. Local Perception & Basic Reactions
- Opt-in front camera with local MediaPipe Face Detector; front/rear switching.
- Largest detected face controls the eyes. No facial identity recognition, distance estimation, navigation or obstacle avoidance.
- Basic mode uses touch and a small keyword mapping, clearly distinguished from generative AI.
- Camera and model load only when enabled. Models/runtime are downloaded from Google and jsDelivr; camera frames are not sent to the generative AI endpoint unless image sharing is enabled.

### 3. Generative Reactions
- Direct Gemini REST `generateContent` integration using the `express` function declaration.
- Text input and hold-to-talk audio, encoded as 16 kHz mono WAV. Release to submit; maximum recording length is 8 seconds.
- Optional current camera frame with each request; optional scene reaction every 15 seconds.
- Validated responses coordinate emotion, electronic sound, and up to six short motor steps.
- Recent six AI interactions are held in memory. No persistent personal memory or identity recognition.
- User-supplied API key is held only in memory, never in localStorage, URLs, logs, or source code. Reloading clears it. API charges may apply.
- Text/audio and explicitly enabled camera images are sent to Google. Browser direct-request support, model availability, quota and account restrictions apply.
- Default model: `gemini-2.5-flash`. A replacement must support audio input, function calling, and the configured generation options.

### 4. AI Ponybot Motion
- Nordic UART service over Web Bluetooth; serialized writes, stop priority, timeout handling, and stale command expiry.
- Four independently addressed motors. Default speed cap: 50; user-adjustable 20–80.
- Each motor command expires after 50–600 ms in the micro:bit receiver.
- Motion stays off until explicitly enabled after connection. Stop, connection loss, AI error and hiding the page disable movement.
- New input interrupts the previous action; stale AI responses cannot restart a cancelled action.
- No physical displacement or motor speed feedback. Test wheel direction and stopping with the actual chassis before use.

### 5. Responsive Controls & Support
- Desktop, tablet, portrait phone and landscape robot-face layouts.
- Connection feedback, AI error explanations, recent reactions, and visible stop controls.
- On-page guide, troubleshooting cards and a downloadable MakeCode receiver.

---

## 🚀 How to Use

1. Open the web app; touch the face or try the four interaction buttons.
2. Enable **Eye Contact** to let PONI look toward a detected face.
3. Open **Connect AI**, enter your own Gemini API key and verify the connection.
4. Send a message, or hold the microphone button while speaking and release to submit. PONI responds using sounds and expressions.
5. Optionally enable camera image sharing and autonomous scene reactions in AI settings.
6. Install the receiver in `microbit/main.ts`, following `microbit/SETUP.md`.
7. Connect the micro:bit and enable **Body Gestures** on a clear floor. This preview has no edge or obstacle detection.
8. Enter full-screen face mode when the phone is mounted on the robot.

## 📡 Communication Protocol

Each ASCII frame ends with one actual LF (`\n`).

| Frame | Meaning |
| --- | --- |
| `M+40+40-40-40T300\n` | M1 +40, M2 +40, M3 -40, M4 -40, duration 300 ms |
| `M+00+00+00+00T100\n` | All motor speeds zero, 100 ms |
| `S\n` | Immediate stop |

Motor frame: **17 ASCII characters + LF = 18 bytes**; stop frame: **2 bytes**. Frames fit a 20-byte BLE payload without splitting.

| Field | Zero-based position | Format |
| --- | --- | --- |
| Motor 1, right front | 1–3 | sign + two digits |
| Motor 2, right rear | 4–6 | sign + two digits |
| Motor 3, left rear | 7–9 | sign + two digits |
| Motor 4, left front | 10–12 | sign + two digits |
| `T` | 13 | duration prefix |
| Duration | 14–16 | milliseconds, three digits |

Positive speed uses `aiPonybot.Direction.Clockwise`; negative uses `CounterClockwise`. The extension's existing motor direction compensation is preserved. The receiver checks the complete frame before applying motor values. Expiry and disconnect stop the motors without relying on another web command. “Sent” means a completed BLE write, not hardware execution acknowledgement.

## 🧩 Project Structure

| Module | Responsibility |
| --- | --- |
| `app.js` | UI, interaction state, cancellation, coordination |
| `face.js`, `audio.js` | Original pixel expressions and synthesized sounds |
| `vision.js` | Local face detection and optional scene snapshots |
| `recorder.js`, `recorder-worklet.js` | Microphone capture and WAV encoding |
| `ai.js`, `core.js` | Gemini tool calls, strict plan validation, protocol |
| `motion.js`, `bluetooth.js` | Motion execution and serialized BLE transport |
| `microbit/main.ts` | Separate Ponybot receiver; does not modify the extension |

## 🛠️ Local Development

No build step or production application server is required. A static HTTPS host can serve these files. **Users do not need Node.js to use the hosted app.**

For a local preview, install Node.js and run:

```sh
npm start
npm test
```

The local server binds to `127.0.0.1:62455`. LAN HTTP access is not suitable for camera/microphone APIs; use the GitHub Pages HTTPS link for testing on a separate phone.

For browser tests, run `npm install` and install Microsoft Edge. With the local preview running, use `npm run test:browser` or `npm run test:vision`. Set `BROWSER_CHANNEL` to use another installed Chromium browser, and `BASE_URL` to check another deployment. Browser test screenshots are written to `.test-results/`.

## ✅ Validation & Limits

Automated checks cover plan validation, protocol bounds, interruption, WAV encoding, simulated receiver expiry, and browser flows with mocked AI/BLE. Browser layout is checked at phone, tablet, desktop and landscape dimensions. Tests do not establish real API quality, real micro:bit compatibility, or iPhone/Bluefy performance.

API credentials and physical hardware are not included. First-use camera/microphone permission, audio activation, and optional Bluetooth require a supported browser and a secure context. Keep the app in the foreground; returning to the tab does not automatically re-enable motion.

## 📚 References

- [LOOI](https://looirobot.com/) — interaction inspiration; artwork is original.
- [Xiaozhi](https://github.com/78/xiaozhi-esp32) — inspiration for exposing hardware capabilities to AI.
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini audio input](https://ai.google.dev/gemini-api/docs/audio)
- [MediaPipe Face Detector](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js)
- [AI Ponybot extension](https://github.com/boundary-x/ai_ponybot_basic)

## 📄 License

Project licensing is not assigned in this preview. Third-party libraries, models and services retain their own licenses and terms.
