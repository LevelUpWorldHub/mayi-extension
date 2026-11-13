# Devpost draft — do not submit

This file is a draft of the #BuildHybridAI Devpost fields. Nothing here has been posted. The deadline on the brief is Monday, November 30, 2026, 2:00 PM PT.

## Project name

MayI

## Tagline

FinePrint. Ask “May I…?” and get the clause, plus the fight between robots.txt and the contract.

## Elevator (about 120 words)

Sites already publish two answers. A robots file tells crawlers what to do. A terms page tells humans something else, often the opposite. Machine Readiness, CrawlPact, and ToS;DR each cover one of those layers. MayI reads both.

On any site, the Chrome side panel answers “May I scrape this?”, “May I train on it?”, “Do they sell my data?”, and questions you type. The verdict is yes, no, or conditional, in one sentence, with the exact quoted clause highlighted on the policy page. When ai.txt allows training and the terms forbid it, that conflict is the headline. Policies are hashed on the device, and the next visit shows a plain-English diff. Inference goes through Firebase AI Logic in prefer-on-device mode, so Gemini Nano answers first and the cloud is a labeled fallback. App Check with reCAPTCHA Enterprise is required before a cloud call.

## Built with

- Chrome Extension Manifest V3 (side panel, offscreen document)
- Vite, React, TypeScript
- Firebase AI Logic hybrid (`firebase/ai`, `InferenceMode.PREFER_ON_DEVICE`)
- Firebase App Check, reCAPTCHA Enterprise
- Gemini Nano on Chrome 139+, cloud fallback `gemini-3.5-flash-lite`

## Links to fill in later

- GitHub: https://github.com/LevelUpWorldHub/mayi-extension
- Demo video: (3-minute YouTube, shot list in `DEMO_SCRIPT.md`)
- Lab: run `npm run dev` and open the local URL. There is no hosted production URL until Firebase config exists.

## Try it

1. Clone the repo and run `npm install` and `npm run dev`.
2. Open the lab. Start on Northwind Archive. The banner should already say the files allow AI training and the terms forbid it.
3. Press **Answer the usual eight**, then **Show this clause**.
4. Open Lumen Health → **Changes** for the privacy diff.
5. Optional: copy `.env.example` to `.env.local`, add a Firebase web app and an App Check reCAPTCHA Enterprise site key, restart, and confirm the badge says On-device or Cloud.

## What’s not in this submission

- No Devpost account action was taken from this repo.
- Android is on the roadmap. The same `prefer_on_device` mode exists for Android once Gemini Nano is available through AICore; this entry ships the Chrome extension.
- Answers are a reading aid. The footer says they are not legal advice.
