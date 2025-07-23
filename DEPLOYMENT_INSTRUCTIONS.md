# 🚀 Deployment Instructions

## Step 1: Create GitHub Repository

1. Go to **https://github.com/new**
2. **Repository name**: `zipcode-to-address`
3. **Description**: `Lightning-fast postal code API with DuckDB and beautiful webapp`
4. **Visibility**: Public (required for free Render hosting)
5. **DO NOT** check "Add a README file" (we already have one)
6. Click **"Create repository"**

## Step 2: Push to GitHub

Run these commands in your terminal:

```bash
# Add GitHub as remote repository (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/zipcode-to-address.git

# Rename branch to main (GitHub standard)
git branch -M main

# Push code to GitHub
git push -u origin main
```

## Step 3: Deploy to Render.com

### 3.1 Sign up/Login to Render
1. Go to **https://render.com**
2. Click **"Sign in with GitHub"**
3. Authorize Render to access your repositories

### 3.2 Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your repository: **zipcode-to-address**
3. Click **"Connect"**

### 3.3 Configuration (Auto-detected from render.yaml)
Render will automatically detect our `render.yaml` file with these settings:
- **Name**: postal-code-lookup-api
- **Environment**: Node
- **Build Command**: `npm ci && npm run setup && npm run ingest`
- **Start Command**: `npm start`
- **Node Version**: 22+

### 3.4 Deploy
1. Click **"Create Web Service"**
2. Wait for deployment (5-10 minutes for first build + data ingestion)
3. Your API will be live at: `https://your-app-name.onrender.com`

## Step 4: Test Your Deployed API

Once deployed, test these endpoints:

```bash
# Health check
https://your-app-name.onrender.com/health

# Webapp
https://your-app-name.onrender.com/

# API examples
https://your-app-name.onrender.com/lookup?country=US&postalCode=90210
https://your-app-name.onrender.com/suggest?country=CA&partial=M5V
```

## Important Notes

✅ **Your project is ready for deployment!**
- Database will be created during build process
- 5M+ postal codes will be ingested automatically
- Webapp is fully functional with CSP compliance
- All dependencies are locked with package-lock.json

⚠️ **Free Tier Limitations:**
- Render free tier spins down after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- Upgrade to paid tier for always-on service

🔧 **Environment Variables:**
No additional environment variables needed - everything works out of the box!

## Troubleshooting

If deployment fails:
1. Check build logs in Render dashboard
2. Ensure Node.js version is 22+
3. Verify all files are committed to GitHub
4. Contact support if data ingestion times out 