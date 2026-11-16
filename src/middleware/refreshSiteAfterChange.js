const refreshSite = require("../utils/refreshSite");

// After the dashboard changes anything, ask the website to load fresh data.
function refreshSiteAfterChange(req, res, next) {
  // Emails and the live product count on gift pages don't change anything on the website.
  const changesNothing = req.originalUrl.startsWith("/api/admin/campaigns") || req.originalUrl.startsWith("/api/admin/pages/match");
  if (req.method === "GET" || changesNothing) return next();

  res.on("finish", () => {
    if (res.statusCode < 400) refreshSite();
  });
  next();
}

module.exports = refreshSiteAfterChange;
