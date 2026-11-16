// Builds the newsletter email. Email apps only understand simple HTML, so this uses tables and inline styles.

const colors = {
  green: "#0f5a3a",
  paper: "#f7f3ed",
  ink: "#1d1b18",
  muted: "#6f6a63",
  line: "#e4ded5",
  olive: "#6b7a3d",
};

const shopNames = { amazon: "Amazon", temu: "Temu" };

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Unsplash can send a smaller, cropped photo, which keeps the email light.
function emailImage(src) {
  if (!src || !src.startsWith("https://images.unsplash.com/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}w=560&h=440&fit=crop&q=75&auto=format`;
}

function formatPrice(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function productCard(product, link) {
  const shop = shopNames[product.retailer] || product.retailer;
  return `
    <td class="product-cell" width="50%" valign="top" style="padding:8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${colors.line};border-radius:12px;overflow:hidden;">
        <tr>
          <td>
            <a href="${escapeHtml(link)}" target="_blank" style="display:block;">
              <img src="${escapeHtml(emailImage(product.image.src))}" alt="${escapeHtml(product.image.alt || product.name)}" width="264" style="display:block;width:100%;height:auto;border:0;border-radius:12px 12px 0 0;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px 18px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${colors.olive};font-weight:bold;">
              ${product.badge ? `${escapeHtml(product.badge)} · ` : ""}Available at ${escapeHtml(shop)}
            </p>
            <a href="${escapeHtml(link)}" target="_blank" style="font-size:16px;line-height:1.3;font-weight:bold;color:${colors.ink};text-decoration:none;">${escapeHtml(product.name)}</a>
            <p style="margin:6px 0 12px;font-size:13px;line-height:1.5;color:${colors.muted};">${escapeHtml(product.description)}</p>
            <p style="margin:0 0 14px;font-size:17px;font-weight:bold;color:${colors.ink};">${formatPrice(product.price.amount)}</p>
            <a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;background:${colors.ink};color:#ffffff;font-size:13px;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:999px;">Check it out &rarr;</a>
          </td>
        </tr>
      </table>
    </td>`;
}

// productLink(product) returns the link for each product, so clicks can be counted per email.
function renderCampaignEmail({ campaign, products, site, siteUrl, unsubscribeUrl, productLink }) {
  const brand = site.name || "Our gift shop";
  const heading = campaign.heading || campaign.subject;
  const buttonUrl = campaign.buttonUrl || siteUrl;
  const rows = [];
  for (let index = 0; index < products.length; index += 2) {
    const pair = products.slice(index, index + 2);
    rows.push(`<tr>${pair.map((product) => productCard(product, productLink(product))).join("")}${pair.length === 1 ? '<td class="product-cell" width="50%"></td>' : ""}</tr>`);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(campaign.subject)}</title>
<style>
  @media (max-width: 520px) {
    .product-cell { display:block !important; width:100% !important; }
    .wrapper { padding: 12px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${colors.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(campaign.previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.paper};">
  <tr>
    <td align="center" class="wrapper" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="padding:0 8px 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${colors.green};">
            <a href="${escapeHtml(siteUrl)}" target="_blank" style="color:${colors.green};text-decoration:none;">${escapeHtml(brand)}</a>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:16px;padding:28px 24px 20px;font-family:Helvetica,Arial,sans-serif;">
            <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:${colors.ink};">${escapeHtml(heading)}</h1>
            ${paragraphs(campaign.intro)
              .map((part) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${colors.ink};">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
              .join("")}
          </td>
        </tr>
        <tr><td style="height:12px;"></td></tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 8px 8px;">
            <a href="${escapeHtml(buttonUrl)}" target="_blank" style="display:inline-block;background:${colors.green};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:999px;">${escapeHtml(campaign.buttonText || "See all gifts")}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${colors.muted};text-align:center;">
            You're getting this email because you signed up for the ${escapeHtml(brand)} newsletter.<br>
            Some links are affiliate links, so we may earn a small commission at no extra cost to you.<br>
            <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color:${colors.muted};text-decoration:underline;">Unsubscribe</a>
            ${site.contactEmail ? ` · <a href="mailto:${escapeHtml(site.contactEmail)}" style="color:${colors.muted};">${escapeHtml(site.contactEmail)}</a>` : ""}
            ${site.mailingAddress ? `<br>${escapeHtml(site.mailingAddress)}` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    "",
    ...paragraphs(campaign.intro).flatMap((part) => [part, ""]),
    ...products.flatMap((product) => [
      `${product.name} - ${formatPrice(product.price.amount)} at ${shopNames[product.retailer] || product.retailer}`,
      product.description,
      productLink(product),
      "",
    ]),
    `${campaign.buttonText || "See all gifts"}: ${buttonUrl}`,
    "",
    `You're getting this email because you signed up for the ${brand} newsletter.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    site.mailingAddress || "",
  ].join("\n");

  return { html, text };
}

module.exports = { renderCampaignEmail, escapeHtml };
