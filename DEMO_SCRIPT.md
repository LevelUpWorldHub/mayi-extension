# MayI FinePrint — 3-minute demo

A YouTube recording for the #BuildHybridAI submission. Target length: 2:45–3:00. Record the lab at `http://127.0.0.1:44731` in a desktop window about 1440px wide, then a phone-width cut of the same page. Voiceover is plain and slow enough to read the stamps.

Do not show API keys, a debug token, or the Firebase console with a real project id if the project is private. The offline samples work with no Firebase config; say that out loud.

## Shot list

| Time | Picture | Say |
| --- | --- | --- |
| 0:00–0:12 | Title card over the Northwind lab. The red conflict banner is already visible: “The files allow AI training. The terms forbid it.” | “Machine Readiness can tell you what robots.txt allows. It never reads the contract. MayI does, on the page, and shows you the sentence.” |
| 0:12–0:32 | Click **Signals**. Pause on robots.txt `ai-train=yes`, ai.txt `Training allow`, then the conflict card. Click **Show this clause**. The left page jumps to the terms and the sentence highlights. | “The files say training is fine. The terms say it isn’t. That disagreement is the whole product. The highlight is the exact clause, not a summary we invented.” |
| 0:32–1:05 | Back to **Ask**. Click **Answer the usual eight**. Stamps land: train No, screenshots If, sell No. Click one **Show this clause** again. | “Each answer is yes, no, or conditional, one sentence, and the quote. A permission question and a risk question don’t share a color. Yes to ‘do they sell my data’ is the bad stamp.” |
| 1:05–1:25 | Type `May I quote a paragraph in a class handout?` and press **Ask**. | “Free-form questions use the same path. With Firebase filled in, this is Gemini Nano through Firebase AI Logic, prefer on-device, and the badge says On-device or Cloud. This build has no keys, so the badge says Local reading. The quote still has to be a real span from the page.” |
| 1:25–1:55 | Switch to **Lumen Health**. Open **Changes**. The privacy diff says they added language about selling personal information. Click **Replay the change** if the diff is already stored. | “MayI hashes the policy on this device. Lumen’s privacy page changed: they now sell location data. The diff is the sentences, not a model’s recollection.” |
| 1:55–2:20 | Switch to **Kindred Press**. Signals shows ai.txt from `/.well-known/ai.txt` and training conditional. Ask “May I train AI on it?” Stamp is If. | “When the files and the contract agree, MayI says so. Kindred allows training if you give credit. Both sides say conditional.” |
| 2:20–2:40 | Switch to **Pinnacle**. Ask “May I cancel anytime?” Stamp is No. Open **Card**, click **Download PNG**, and flash the image. | “Pinnacle hides cancellation in a long contract: certified mail only. The card is the permission slip, as an image or Markdown.” |
| 2:40–3:00 | Narrow the window until the sample site stacks above the panel. End on the footer: “Not legal advice.” | “It runs as a Chrome side panel. Policies stay on the device unless a long document needs the labeled cloud fallback. This is a reading aid, not a lawyer.” |

## Before you hit record

1. `npm install` then `npm run dev`.
2. Hard-refresh the lab so Lumen’s first visit still has an empty store, or press **Replay the change** on the Changes tab.
3. If you have Mark’s Firebase config in `.env.local`, restart the dev server and point at the **On-device** or **Cloud** badge for one answer. Keep the key file off camera.
4. Optional second take: load the unpacked `dist/` extension, open a sample page, and press **This tab** so the side panel is in the shot.
