const ReferralLink = require("../models/ReferralLink");
const slugify = require("./slugify");

function publicUrl() {
  return process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
}

function referralLinkUrl(code) {
  return `${publicUrl()}/go/${code}`;
}

// The shape the website expects. Visitors are sent through the referral link so clicks are counted.
function toPublicProduct(product) {
  const result = {
    id: product.slug,
    name: product.name,
    description: product.description,
    details: product.details || undefined,
    price: { amount: product.price.amount, currency: product.price.currency || "USD" },
    retailer: product.retailer,
    image: { src: product.image.src, alt: product.image.alt || "" },
    affiliateUrl: product.referralCode ? referralLinkUrl(product.referralCode) : product.affiliateUrl,
    badge: product.badge || undefined,
    audiences: product.audiences || [],
    interests: product.categories || [],
    trending: Boolean(product.trending),
    isSampleData: Boolean(product.isSampleData),
  };

  if (product.altImage && product.altImage.src) {
    result.altImage = { src: product.altImage.src, alt: product.altImage.alt || "" };
  }
  if (product.video && product.video.src) {
    result.video = { src: product.video.src };
  }
  return result;
}

async function findFreeCode(wantedCode, ignoreId) {
  const baseCode = slugify(wantedCode) || "link";
  let code = baseCode;
  let number = 2;

  while (await ReferralLink.exists({ code, _id: { $ne: ignoreId } })) {
    code = `${baseCode}-${number}`;
    number += 1;
  }
  return code;
}

// Every product gets its own referral link. This keeps the link in step with the product.
async function syncProductReferral(product) {
  let link = await ReferralLink.findOne({ product: product._id });

  if (!link) {
    const code = await findFreeCode(product.slug);
    link = await ReferralLink.create({
      code,
      name: product.name,
      destinationUrl: product.affiliateUrl,
      retailer: product.retailer,
      product: product._id,
    });
  } else {
    link.name = product.name;
    link.destinationUrl = product.affiliateUrl;
    link.retailer = product.retailer;
    await link.save();
  }

  if (product.referralCode !== link.code) {
    product.referralCode = link.code;
    await product.save();
  }
  return link;
}

module.exports = { toPublicProduct, syncProductReferral, findFreeCode, referralLinkUrl };
