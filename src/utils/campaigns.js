const crypto = require("crypto");
const Campaign = require("../models/Campaign");
const Content = require("../models/Content");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const Product = require("../models/Product");
const { renderCampaignEmail } = require("./emailTemplate");
const { RESEND_BATCH_SIZE, emailProvider, sendEmail, sendResendBatch } = require("./mailer");

function publicUrl() {
  return process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
}

function siteUrl() {
  return process.env.SITE_URL || "http://localhost:3000";
}

async function getSiteInfo() {
  const item = await Content.findOne({ key: "site" }).lean();
  return item ? item.value : {};
}

// Products in the order they were picked, leaving out any that were deleted or hidden.
async function loadCampaignProducts(ids) {
  const products = await Product.find({ _id: { $in: ids }, active: true }).lean();
  return ids.map((id) => products.find((product) => String(product._id) === String(id))).filter(Boolean);
}

function productLinkFor(tag) {
  return (product) => {
    const code = product.referralCode || product.slug;
    return `${publicUrl()}/go/${encodeURIComponent(code)}?from=${tag}`;
  };
}

function unsubscribeUrl(token) {
  return `${publicUrl()}/unsubscribe/${token}`;
}

// Older subscribers were added before unsubscribe links existed, so give them a saved code now.
async function ensureUnsubscribeTokens() {
  const missing = await NewsletterSubscriber.find({ unsubscribeToken: { $exists: false } }).select("_id").lean();
  for (const subscriber of missing) {
    await NewsletterSubscriber.updateOne(
      { _id: subscriber._id, unsubscribeToken: { $exists: false } },
      { unsubscribeToken: crypto.randomBytes(24).toString("hex") }
    );
  }
  return missing.length;
}

function buildEmail({ campaign, products, site, token, tag }) {
  return renderCampaignEmail({
    campaign,
    products,
    site,
    siteUrl: siteUrl(),
    unsubscribeUrl: token ? unsubscribeUrl(token) : `${publicUrl()}/unsubscribe/preview`,
    productLink: productLinkFor(tag),
  });
}

function buildMessage({ to, campaign, products, site, token, tag, subjectPrefix = "" }) {
  const { html, text } = buildEmail({ campaign, products, site, token, tag });
  const headers = {};
  if (token) {
    headers["List-Unsubscribe"] = `<${unsubscribeUrl(token)}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    to,
    subject: `${subjectPrefix}${campaign.subject}`,
    html,
    text,
    headers,
    replyTo: site.contactEmail || undefined,
    tags: [{ name: "campaign", value: campaign._id ? String(campaign._id) : "test" }],
  };
}

async function sendOneEmail(options) {
  await sendEmail(buildMessage(options));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Keeps the running totals and saves them, so the dashboard can show progress.
function createTally(campaignId) {
  const tally = { sentCount: 0, failedCount: 0, failedEmails: [], stopReason: "" };
  tally.fail = (email, reason) => {
    tally.failedCount += 1;
    if (tally.failedEmails.length < 50) tally.failedEmails.push(`${email}: ${reason}`);
  };
  tally.save = () =>
    Campaign.updateOne({ _id: campaignId }, { sentCount: tally.sentCount, failedCount: tally.failedCount, failedEmails: tally.failedEmails });
  return tally;
}

// Resend: 100 emails per request. If Resend refuses a batch because of a bad address, send that batch one by one.
async function sendWithResend({ subscribers, buildFor, campaignId, tally }) {
  const requestsPerSecond = Math.max(1, Number(process.env.RESEND_REQUESTS_PER_SECOND) || 2);

  for (let start = 0; start < subscribers.length; start += RESEND_BATCH_SIZE) {
    const group = subscribers.slice(start, start + RESEND_BATCH_SIZE);
    const batchNumber = start / RESEND_BATCH_SIZE + 1;

    if (tally.stopReason) {
      group.forEach((subscriber) => tally.fail(subscriber.email, "Not sent because sending stopped."));
      continue;
    }

    try {
      // The same key means Resend won't send this batch twice, even if we have to ask again.
      await sendResendBatch(group.map(buildFor), `campaign-${campaignId}/batch-${batchNumber}`);
      tally.sentCount += group.length;
    } catch (error) {
      if (error.stopSending) {
        tally.stopReason = error.message;
        group.forEach((subscriber) => tally.fail(subscriber.email, error.message));
      } else if (error.status === 400 || error.status === 422) {
        for (const subscriber of group) {
          try {
            await sendEmail(buildFor(subscriber), `campaign-${campaignId}/one-${subscriber._id}`);
            tally.sentCount += 1;
          } catch (singleError) {
            tally.fail(subscriber.email, singleError.message);
            if (singleError.stopSending) {
              tally.stopReason = singleError.message;
              break;
            }
          }
          await sleep(1000 / requestsPerSecond);
        }
      } else {
        group.forEach((subscriber) => tally.fail(subscriber.email, error.message));
      }
    }

    await tally.save();
    await sleep(1000 / requestsPerSecond);
  }
}

// SMTP: one email at a time, slowly enough that the provider doesn't block us.
async function sendWithSmtp({ subscribers, buildFor, tally }) {
  const perSecond = Math.max(1, Number(process.env.EMAIL_RATE_PER_SECOND) || 5);

  for (const [index, subscriber] of subscribers.entries()) {
    try {
      await sendEmail(buildFor(subscriber));
      tally.sentCount += 1;
    } catch (error) {
      tally.fail(subscriber.email, error.message);
    }
    if (index % 10 === 9 || index === subscribers.length - 1) await tally.save();
    await sleep(1000 / perSecond);
  }
}

// Sends a campaign to everyone on the list.
async function sendCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  const products = await loadCampaignProducts(campaign.products);
  const site = await getSiteInfo();
  await ensureUnsubscribeTokens();
  const subscribers = await NewsletterSubscriber.find({ subscribed: true }).select("email unsubscribeToken").lean();
  const tag = `email-${campaign._id}`;
  const buildFor = (subscriber) =>
    buildMessage({ to: subscriber.email, campaign, products, site, token: subscriber.unsubscribeToken, tag });

  await Campaign.updateOne({ _id: campaign._id }, { recipientCount: subscribers.length, startedAt: new Date() });

  const tally = createTally(campaign._id);
  if (emailProvider() === "resend") {
    await sendWithResend({ subscribers, buildFor, campaignId: campaign._id, tally });
  } else {
    await sendWithSmtp({ subscribers, buildFor, tally });
  }

  const allFailed = subscribers.length > 0 && tally.sentCount === 0;
  let error = "";
  if (tally.stopReason) error = `Sending stopped early: ${tally.stopReason}`;
  else if (allFailed) error = "No emails could be sent. Check the email settings in backend/.env.";

  await Campaign.updateOne(
    { _id: campaign._id },
    {
      status: allFailed || tally.stopReason ? "failed" : "sent",
      sentAt: new Date(),
      sentCount: tally.sentCount,
      failedCount: tally.failedCount,
      failedEmails: tally.failedEmails,
      error,
    }
  );
}

// If the server stopped while sending, those campaigns would look stuck, so mark them as stopped.
async function markInterruptedCampaigns() {
  await Campaign.updateMany(
    { status: "sending" },
    { status: "failed", error: "Sending stopped because the server restarted. Some people may not have received it." }
  );
}

module.exports = {
  buildEmail,
  ensureUnsubscribeTokens,
  getSiteInfo,
  loadCampaignProducts,
  markInterruptedCampaigns,
  sendCampaign,
  sendOneEmail,
};
