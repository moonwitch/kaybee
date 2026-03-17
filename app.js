// Require modules
require("dotenv").config();
const express = require("express");
const hbs = require("hbs");
const compression = require("compression");
const NodeCache = require("node-cache");
const axios = require("axios");
const {
  getWikiData,
  getDocContent,
  getDocMetadata,
  getDocComments,
} = require("./lib/google-drive");

// App setup
const app = express();
const port = process.env.PORT || 8080;
const myCache = new NodeCache({ stdTTL: 3600 }); // 1 hour default cache

// Middleware & View Engine
app.use(compression());
app.set("view engine", "hbs");
app.use(express.static("public"));

// --- IMAGE PROXY ROUTE ---
// Solves slow LCP by serving Google images through our server with cache headers
app.get("/proxy-img", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send("No URL provided");

  try {
    const response = await axios({
      url: imageUrl,
      method: "GET",
      responseType: "stream",
      timeout: 5000,
    });

    // Set browser caching to 1 day for better performance
    res.setHeader("Cache-Control", "public, max-age=86400");
    response.data.pipe(res);
  } catch (err) {
    res.status(500).send("Proxy error");
  }
});

// Warmup logic with minimal, useful logging
async function warmUpCache() {
  try {
    const categories = await getWikiData(process.env.ROOT_FOLDER_ID);
    myCache.set("dashboard_data", categories);
    // Just a heartbeat log
    console.log(`[${new Date().toISOString()}] Cache refreshed successfully.`);
  } catch (err) {
    // Crucial for debugging production issues
    console.error("CRITICAL: Warmup failed:", err.message);
  }
}

// Initial warmup on startup
warmUpCache();
// Refresh every 10 minutes
setInterval(warmUpCache, 10 * 60 * 1000);

// Dashboard Route
app.get("/", async (req, res) => {
  try {
    // Check if we have warmed-up dashboard data
    const cachedDashboard = myCache.get("dashboard_data");
    if (cachedDashboard) {
      return res.render("index", { categories: cachedDashboard });
    }

    const categories = await getWikiData(process.env.ROOT_FOLDER_ID);
    res.render("index", { categories });
  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).send("Drive Error: " + err.message);
  }
});

// Article Route with Multi-layer Caching & Comments
app.get("/doc/:id", async (req, res) => {
  const cacheKey = `doc_full_${req.params.id}`;
  const cached = myCache.get(cacheKey);

  if (cached) return res.render("article", cached);

  try {
    // Fetch all required data in parallel
    let [content, metadata, comments] = await Promise.all([
      getDocContent(req.params.id),
      getDocMetadata(req.params.id),
      getDocComments(req.params.id),
    ]);

    // --- REWRITE IMAGE URLS ---
    // Inject proxy route into HTML to bypass Google's slow image serving
    content = content.replace(
      /src="([^"]+)"/g,
      (match, p1) => `src="/proxy-img?url=${encodeURIComponent(p1)}"`,
    );

    const data = {
      content,
      docId: req.params.id,
      docName: metadata.docName,
      categoryName: metadata.categoryName,
      comments: comments,
    };

    myCache.set(cacheKey, data);
    res.render("article", data);
  } catch (err) {
    // Logs to Cloud Logging so you can see it in the GCP Console
    console.error(`Error fetching doc ${req.params.id}:`, err.message);
    res.status(404).send("Document not found.");
  }
});

app.listen(port, () =>
  console.log(`🌿 KayBee live at http://localhost:${port}`),
);
