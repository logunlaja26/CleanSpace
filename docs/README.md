# CleanSpace Support Website

This directory contains the support website for CleanSpace, including:
- **index.html** - Main support page with FAQ
- **privacy.html** - Privacy Policy (required for App Store)
- **terms.html** - Terms of Service (required for in-app purchases)

## Quick Start

### Option 1: GitHub Pages (Recommended)

1. **Create a new GitHub repository:**
   ```bash
   # Navigate to your project
   cd /Users/gabrielholmes/Documents/IOS-Projects/CleanSpace

   # Initialize git (if not already)
   git init

   # Add remote (replace with your username)
   git remote add origin https://github.com/YOUR_USERNAME/cleanspace-support.git
   ```

2. **Push docs to GitHub:**
   ```bash
   git add docs/
   git commit -m "Add support website"
   git push origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under "Source", select **main branch** → **/docs folder**
   - Click **Save**
   - Your site will be available at: `https://YOUR_USERNAME.github.io/cleanspace-support/`

4. **Update App Store Connect:**
   - Go to App Store Connect → CleanSpace → App Information
   - Enter Support URL: `https://YOUR_USERNAME.github.io/cleanspace-support/`
   - Save changes

---

### Option 2: Alternative Free Hosting

#### Netlify (Drag & Drop)
1. Go to [netlify.com](https://www.netlify.com/)
2. Drag the `docs` folder to "Deploy manually"
3. Copy the provided URL

#### Vercel
1. Go to [vercel.com](https://vercel.com/)
2. Click "New Project"
3. Import your GitHub repository
4. Set "Root Directory" to `docs`
5. Deploy

#### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select 'docs' as public directory
firebase deploy
```

---

## Customization

### Update Email Addresses

Replace all instances of:
- `lyomanndesign@gmail.com` → Your actual support email
- `lyomanndesign@gmail.com` → Your actual privacy email
- `lyomanndesign@gmail.com` → Your actual legal email

You can use the same email for all three if needed.

### Update Copyright

In all HTML files, replace:
- `Lyomann Designs` → Your company/developer name
- `2026` → Current year

### Update Governing Law (terms.html)

In `terms.html`, line with "Governing Law", replace:
- `[Your State/Country]` → Your actual jurisdiction (e.g., "California, USA")

---

## Testing Locally

To preview the site locally:

```bash
cd docs
python3 -m http.server 8000
```

Then open: `http://localhost:8000`

---

## Required for App Store Submission

✅ Support URL (use your GitHub Pages URL)
✅ Privacy Policy URL (add `/privacy.html` to your URL)

Example for App Store Connect:
- **Support URL**: `https://yourusername.github.io/cleanspace-support/`
- **Privacy Policy URL**: `https://yourusername.github.io/cleanspace-support/privacy.html`

---

## Files Overview

| File | Purpose | Required by App Store |
|------|---------|----------------------|
| `index.html` | Support page with FAQ | ✅ Yes (Support URL) |
| `privacy.html` | Privacy Policy | ✅ Yes (Privacy Policy) |
| `terms.html` | Terms of Service | ✅ Yes (In-App Purchases) |

---

## Maintenance

### Update Last Modified Date

When you make changes, update the "Last Updated" date in:
- `privacy.html` (line 45)
- `terms.html` (line 44)

### Add New FAQs

Edit `index.html` and add new FAQ items in the FAQ section using this format:

```html
<div class="faq-item">
    <h3>Your Question Here?</h3>
    <p>Your answer here.</p>
</div>
```

---

## Support

If you have questions about deploying this site, contact Claude or check the GitHub Pages documentation: https://docs.github.com/en/pages
