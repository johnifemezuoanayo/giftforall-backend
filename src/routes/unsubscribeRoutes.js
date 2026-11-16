const express = require("express");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const Content = require("../models/Content");
const { escapeHtml } = require("../utils/emailTemplate");

const router = express.Router();

async function brandName() {
  const item = await Content.findOne({ key: "site" }).lean();
  return item?.value?.name || "our newsletter";
}

function page({ title, body, brand }) {
  const siteUrl = process.env.SITE_URL || "/";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(brand)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f3ed; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1b18; padding: 16px; box-sizing: border-box; }
  .box { background: #fff; border: 1px solid #e4ded5; border-radius: 16px; padding: 32px 28px; max-width: 440px; width: 100%; text-align: center; box-sizing: border-box; }
  h1 { font-size: 1.4rem; margin: 0 0 10px; }
  p { color: #6f6a63; line-height: 1.6; margin: 0 0 20px; }
  button, .link-button { display: inline-block; border: none; border-radius: 999px; padding: 12px 24px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
  .primary { background: #0f5a3a; color: #fff; }
  .light { background: none; color: #0f5a3a; text-decoration: underline; }
  form { margin: 0 0 8px; }
</style>
</head>
<body>
  <main class="box">
    ${body}
    <a class="link-button light" href="${escapeHtml(siteUrl)}">Go to ${escapeHtml(brand)}</a>
  </main>
</body>
</html>`;
}

// Shows a button instead of unsubscribing straight away, because email scanners open links on their own.
router.get("/:token", async (req, res) => {
  const brand = await brandName();
  const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: req.params.token });

  if (!subscriber) {
    return res.status(404).send(page({ brand, title: "Link not found", body: "<h1>This link doesn't work anymore</h1><p>You may already be removed from the list.</p>" }));
  }
  if (!subscriber.subscribed) {
    return res.send(page({ brand, title: "Already unsubscribed", body: `<h1>You're already unsubscribed</h1><p>${escapeHtml(subscriber.email)} won't get any more emails from us.</p>` }));
  }

  res.send(
    page({
      brand,
      title: "Unsubscribe",
      body: `<h1>Unsubscribe from ${escapeHtml(brand)}?</h1>
        <p>${escapeHtml(subscriber.email)} will stop getting our gift ideas by email.</p>
        <form method="post"><button class="primary" type="submit">Yes, unsubscribe me</button></form>`,
    })
  );
});

// Used by the button above and by the one-click unsubscribe in email apps like Gmail.
router.post("/:token", async (req, res) => {
  const brand = await brandName();
  const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: req.params.token });
  if (!subscriber) {
    return res.status(404).send(page({ brand, title: "Link not found", body: "<h1>This link doesn't work anymore</h1><p>You may already be removed from the list.</p>" }));
  }

  if (subscriber.subscribed) {
    subscriber.subscribed = false;
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();
  }

  res.send(
    page({
      brand,
      title: "Unsubscribed",
      body: `<h1>You're unsubscribed</h1>
        <p>${escapeHtml(subscriber.email)} won't get any more emails from us. Sorry to see you go!</p>
        <form method="post" action="${escapeHtml(req.baseUrl)}/${escapeHtml(subscriber.unsubscribeToken)}/resubscribe"><button class="light" type="submit">Changed your mind? Subscribe again</button></form>`,
    })
  );
});

router.post("/:token/resubscribe", async (req, res) => {
  const brand = await brandName();
  const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: req.params.token });
  if (!subscriber) {
    return res.status(404).send(page({ brand, title: "Link not found", body: "<h1>This link doesn't work anymore</h1><p>Sign up again on our website.</p>" }));
  }

  subscriber.subscribed = true;
  subscriber.unsubscribedAt = null;
  await subscriber.save();
  res.send(page({ brand, title: "Welcome back", body: `<h1>Welcome back!</h1><p>${escapeHtml(subscriber.email)} is on the list again.</p>` }));
});

module.exports = router;
