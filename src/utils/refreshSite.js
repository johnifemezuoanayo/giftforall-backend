let timer = null;

// Waits a moment so many quick changes only refresh the site once.
function refreshSite() {
  clearTimeout(timer);
  timer = setTimeout(sendRefresh, 300);
}

async function sendRefresh() {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) return;

  try {
    const response = await fetch(`${siteUrl}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET || "" },
    });
    if (!response.ok) console.log("Website refresh failed with status", response.status);
  } catch (error) {
    // The website may not be running. It will still pick up changes within a few minutes.
    console.log("Could not reach the website to refresh it:", error.message);
  }
}

module.exports = refreshSite;
