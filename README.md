# Flustered

Anxiety companion app. FLUX + 5 voices + breathwork + sleep + mood tracking.

## Deploy to Vercel in 5 steps

### 1. Push to GitHub
Create a new repo called FLUSTERED and push this folder.

### 2. Get your Anthropic API key
Go to console.anthropic.com → API Keys → Create key. Copy it.

### 3. Deploy on Vercel
- Go to vercel.com → Add New Project → Import your FLUSTERED repo
- Before clicking Deploy, go to Environment Variables and add:
  - Name: `ANTHROPIC_API_KEY`
  - Value: your key from step 2
- Click Deploy

### 4. Connect flustered.ai
In Vercel → your project → Settings → Domains → add `flustered.ai`
Then in your domain registrar, point DNS to Vercel's nameservers.
Takes 10–30 minutes to propagate.

### 5. Test
Open flustered.ai, go through onboarding, talk to FLUX.
The API key never leaves the server. Users can't see it.

## Local development

```bash
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
# Open http://localhost:3000
```

## File structure

```
pages/
  index.js          → renders the app
  api/
    flux-chat.js    → API proxy (keeps key server-side)
components/
  Flustered.js      → the full app
.env.example        → copy to .env.local, add your key
.gitignore          → protects .env.local from being committed
```

## Adding Stripe (next step)

1. Create products in Stripe dashboard: $9.99/mo and $59.99/yr
2. Add `pages/api/create-checkout.js` (Stripe session)
3. Add `pages/api/webhook.js` (sets isPro in DB after payment)
4. Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
