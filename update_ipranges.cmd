@echo off
:: Keeps the LOCAL copy of Google's crawler IP ranges fresh and pushes updates
:: to GitHub (which auto-deploys to Heroku). Runs every 12h via Task Scheduler.
cd /d "d:\my projects\popups\popups\new_japan\english"
node download_ipranges.js
git add ipranges
git diff --cached --quiet || (git commit -m ipranges-auto-update && git push origin main)