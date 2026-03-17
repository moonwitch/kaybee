# 🌿 Kaybee

### Internal Knowledge Base // Google Drive → Brutalist Wiki

**Kaybee** is a high-performance, internal wiki that turns a Google Drive folder structure into a smooth, searchable, and collaborative knowledge base. Built with a "Morandi Brutalist" aesthetic, it prioritizes speed, clarity, and ease of use.

---

## 🚀 Key Features

- **Dynamic Routing:** Automatically maps your Google Drive folder structure to wiki categories and articles.
- **Image Proxying:** Fixes slow Google Drive image loading by proxying and caching images on the server for a lightning-fast LCP (Largest Contentful Paint).
- **Live Search:** Brutalist search bar for real-time filtering of documents and categories.
- **Collaboration Layer:** Pulls active Google Doc comments directly into the wiki as a discussion thread.
- **Multi-layer Caching:** Uses `node-cache` and background "warm-up" cycles to ensure zero-latency navigation.
- **Mobile First:** Responsive 80vw layout designed for both desktop deep-dives and mobile quick-checks.

---

## 🛠️ Technical Stack

- **Runtime:** Node.js 24 (LTS)
- **Backend:** Express.js
- **Templates:** Handlebars (HBS)
- **Styles:** CSS Variables (Theme-able), Space Grotesk Typography
- **Infrastructure:** Dockerized for Google Cloud Run
- **Region:** `europe-west4` (Default)

---

## ⚙️ Configuration

Kaybee requires the following environment variables in a `.env` file:

```env
PORT=8080
ROOT_FOLDER_ID=your_google_drive_folder_id
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

---

## Google Drive Setup

1. Create a Service Account in the GCP Console.
2. Share your Root Wiki Folder in Google Drive with the Service Account email (Viewer access).
3. Ensure the Root Folder contains subfolders (Categories) and Google Docs (Articles).

---

## 📦 Deployment

### Local Development

```bash
npm install
npm start
```

### Deploy to Google Cloud Run

```bash
gcloud run deploy kaybee --source . --region europe-west4 --allow-unauthenticated
```

---

## 🎨 Themeing

You can easily adjust the "Morandi" look by editing the variables in public/css/style.css:

- `--m-bg`: Main background color
- `--m-accent-rose`: Highlight color for labels and hover states
- `--font-main`: Swap out Space Grotesk for any other font stack

---

## 🧘 Maintenance

Kaybee is designed to be low-maintenance. The cache refreshes automatically every 10 minutes, and the image proxy ensures that even large technical diagrams don't slow down the user experience.
