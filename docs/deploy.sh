#!/bin/bash

# CleanSpace Support Website Deployment Script
# This script helps you quickly deploy the support site to GitHub Pages

echo "🚀 CleanSpace Support Website Deployment"
echo "=========================================="
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "⚠️  Git repository not initialized."
    echo "Do you want to initialize a new git repository? (y/n)"
    read -r response
    if [[ "$response" == "y" ]]; then
        git init
        echo "✅ Git repository initialized"
    else
        echo "❌ Deployment cancelled. Please initialize git manually."
        exit 1
    fi
fi

# Check if remote is set
if ! git remote get-url origin &> /dev/null; then
    echo ""
    echo "⚠️  No remote repository set."
    echo "Please enter your GitHub repository URL (e.g., https://github.com/username/cleanspace-support.git):"
    read -r repo_url
    git remote add origin "$repo_url"
    echo "✅ Remote repository added: $repo_url"
fi

echo ""
echo "📁 Adding support website files..."
git add docs/

echo "💬 Creating commit..."
git commit -m "Add CleanSpace support website with privacy policy and terms"

echo ""
echo "🌐 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Go to your GitHub repository"
echo "2. Click Settings → Pages"
echo "3. Under 'Source', select 'main branch' → '/docs folder'"
echo "4. Click Save"
echo "5. Your site will be live at: https://YOUR_USERNAME.github.io/REPO_NAME/"
echo ""
echo "6. Add this URL to App Store Connect as your Support URL"
echo ""
echo "🎉 Done!"
