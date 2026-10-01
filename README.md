# Startline MVP

A start-sooner app for students and young adults aged 18 to 22. Add the task you keep avoiding, get a first step under 2 minutes, run a focus sprint, and see proof that you now start sooner. Long-term goals become a "race" of small laps and steps.

Free and Pro plans are built in, with sign-in. Progress lives in the browser first (works offline and without an account). Signing in adds a backup that syncs across devices, and lets the Pro subscription follow the person to any phone.

## Who it is for

Startline is for people **18 and over**, aimed at ages 18 to 22 (college, exam prep, first job or internship). A first-run age check asks for birth month and year, and only a yes or no is kept on the device. Sign-in is refused unless the app confirms 18+. This keeps the app clear of the DPDP Act's rules for children (parental consent, no tracking or targeted ads aimed at minors). It is a self-declared gate, not identity verification. Get legal advice before adding partner rewards.

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Tasks, first-step suggestions, focus sprints, wins | Yes | Yes |
| Streak, focus minutes, completion rate | Yes | Yes |
| Races | One every 3 days, each with a personal AI plan | No waiting, personal AI plans |
| Before/after start-delay comparison and weekly chart | Locked | Yes |

## Run it on Replit

1. Unzip this folder on your computer.
2. In Replit, create a new Repl (Node.js), then drag all the unzipped files into it. Or push the folder to GitHub and use "Import from GitHub".
3. Press **Run**. Replit installs the packages and starts the server.
4. The app opens in the preview pane. It starts in **test mode**: the paywall works, but payments are simulated and nobody is charged. A "Test mode" badge shows on the paywall.

Try it: add a task, start a sprint, open Race, create a second race, and the paywall appears. Tap the trial button to switch Pro on.

If Replit complains about the `.replit` file, delete it and set the Run command to `npm start`.

## Free hosting without Replit (GitHub + Render + Upstash)

1. **Upstash (free database).** Sign up at console.upstash.com, create a Redis database, and copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from its REST API section.
2. **Render (free server).** Sign up at render.com with GitHub. Click New, then Blueprint (or Web Service), pick this repository, and let it read `render.yaml`. Paste the two Upstash values when asked. `TOKEN_SECRET` is generated for you.
3. Open the address Render gives you. It starts in test mode, so payments are simulated and test sign-in works.
4. To go live, add the Razorpay and `GOOGLE_CLIENT_ID` values in Render's Environment tab, and add your Render address to Google's Authorized JavaScript origins.

Notes: free Render services sleep after 15 minutes without visitors and take about a minute to wake. Their disk is wiped on every restart, which is why the database lives on Upstash. Check each provider's current free limits when you sign up.

## Sign-in

Two modes, chosen automatically:

- **Test sign-in** (no setup): if `GOOGLE_CLIENT_ID` is not set, the login sheet asks for a made-up name. It is only for trying the app and is refused when live payments are on.
- **Google sign-in** (real): 
  1. Google Cloud Console, then APIs & Services, then Credentials, then Create credentials, then OAuth client ID, type **Web application**.
  2. Under **Authorized JavaScript origins** add your Replit preview URL and your deployed URL (no trailing slash).
  3. Put the client id in Replit Secret `GOOGLE_CLIENT_ID`.
  4. On the OAuth consent screen, set publishing status to **In production**, otherwise only listed test users can sign in.

Sign-in is optional for free use. It is asked for when the person subscribes, or from the account row on the Report tab. Signed-in people can back up and restore progress, sign out, erase their backup, or delete their account (cancel Pro first).

## Go live with real payments

Add these in Replit **Secrets** (padlock icon). `.env.example` lists every name.

Always set:
- `GOOGLE_CLIENT_ID` : Google sign-in (real sign-in is required for live payments)
- `BREVO_API_KEY` + `BREVO_SENDER` : email sign-in codes (free on brevo.com; verify the sender address there). Only a one-way hash of the email is stored.
- `PAYMENTS_PROVIDER` : `razorpay` or `stripe`
- `TOKEN_SECRET` : long random text. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `PRICE_LABEL` : the text shown on the paywall, for example `₹149 / month`. It must match the price you create at the provider.
- `TRIAL_DAYS` : free trial length, or `0`

### Razorpay (recommended in India)

Stripe accounts for Indian businesses are invite-only, so Razorpay is the practical choice.

1. In the Razorpay dashboard, go to Subscriptions, then Plans, and create a monthly plan at your price. Copy the plan id.
2. Copy your Key Id and Key Secret from Account & Settings, then API Keys. Use Test Mode keys first.
3. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`.
4. Test with Razorpay's test cards, then switch to Live keys.

### Stripe (if you have an account)

1. Create a product with a recurring price. Copy the price id.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`.
3. In Stripe settings, turn on the Customer Portal so users can manage or cancel.

### AI race planner

The planner asks 3 to 5 follow-up questions about the goal, then writes a plan of up to 2 years (up to 12 laps, each with a focus, a weekly rhythm and small steps), plus an honest "is this realistic?" note. Free accounts can start one race every 3 days (`FREE_RACE_COOLDOWN_DAYS`), with at most 4 AI calls a day (`FREE_AI_DAILY_CALLS`). Pro has no waiting. The AI limits are enforced on the server. The 3-day wait on creating a race is also checked in the app. Plans are sized to the time available (server enforces total minutes and drops trivial setup steps). Each day the app puts that day's work on Today by itself, sized to the user's daily time, and manual task adding is off while a race is active. There is no built-in fallback plan: if the AI cannot answer, the user is asked to try again and nothing is used up.

Turn it on with one of these Secrets (Render: Environment tab):
- **Anthropic (paid, cents per plan):** `ANTHROPIC_API_KEY` from console.anthropic.com. It uses a small, low-cost model by default. Change it with `AI_MODEL`.
- **Google Gemini (has a free tier for some models):** set `AI_PROVIDER=gemini`, `GEMINI_API_KEY` from aistudio.google.com, and `AI_MODEL` to a model id that Google's pricing page lists with a free tier. There is no default, because model names change. Free-tier data may be used by Google, so read their terms.
- **Groq (free backup):** `GROQ_API_KEY` from console.groq.com. Used automatically when Gemini or Anthropic is busy. Weak or malformed answers are asked again, on another provider when possible.

Spending is capped: 30 AI calls per Pro person per day and 500 per day overall. Change them with `AI_DAILY_LIMIT` and `AI_GLOBAL_DAILY_LIMIT`.

### Publish

Use Replit **Deploy** (Autoscale is fine). Copy the same Secrets into the deployment. If checkout redirects to the wrong address, set `PUBLIC_URL` to your live address.

## What the server stores

Only what an account needs, and nothing that identifies the person:

- an opaque account id (from Google's `sub`; your server never saves name, email or photo),
- the subscription reference (provider customer or subscription id),
- an optional backup of their progress (tasks, sprints, races), capped at 300 KB. Example data is never uploaded.

Storage is Upstash Redis when its two values are set, Replit Database on Replit (no setup), and otherwise a JSON file in `data/` on your own computer. The development Repl and the deployed app have separate databases. Payment details and email stay with the payment provider. Sessions are signed tokens valid for 90 days; deleting an account signs out every device and erases the backup.

## Known limits

- **Only the AI planner is locked on the server.** The race limit, the weekly chart and the comparison are locked in the interface. A technical user could bypass them, and a bypass gives them nothing that costs you money. Fine for an MVP.
- **Sync is whole-copy, not merged.** If two devices change progress separately, the app asks which copy to keep. Simple and safe, but nothing is combined.
- **Google, Replit Database and payments were not tested against live accounts.** They follow the official docs and libraries; the local tests use test sign-in and simulated payments. Try each once in test mode.
- **Counters reset on restart.** The AI limits and rate limits are in memory.
- **Test the payment flows in the provider's test mode** before charging real users. The provider code was checked against the docs but not against live accounts.
- **Before launch, check the legal side for your audience.** For users under 18 in India, the DPDP Act expects verifiable parental consent. You will also need terms, a privacy policy, a refund policy, and GST if you cross the threshold. This is not legal advice.

## Files

```
server.js        API: sign-in, sync, billing, AI planner
lib/store.js     Upstash Redis, Replit Database or local file
render.yaml      Render blueprint (free plan)
lib/billing.js   demo, Stripe and Razorpay behind one interface
lib/token.js     signed session token
public/          the app (index.html, app.js, style.css)
.replit          Replit run and deploy settings
.env.example     every Secret name
```
