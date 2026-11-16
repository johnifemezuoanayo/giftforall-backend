// Same rules the website uses to decide which products a gift page shows. Every rule that is set must match.
function productMatchesRule(product, rule) {
  if (rule.ids && rule.ids.length && !rule.ids.includes(product.slug)) return false;
  if (rule.trending && !product.trending) return false;
  if (rule.audiences && rule.audiences.length && !product.audiences.some((audience) => rule.audiences.includes(audience))) return false;
  if (rule.interests && rule.interests.length && !product.categories.some((slug) => rule.interests.includes(slug))) return false;
  if (rule.maxPrice !== undefined && rule.maxPrice !== null && product.price.amount > rule.maxPrice) return false;
  return true;
}

function productsForRule(products, rule) {
  let list = products.filter((product) => productMatchesRule(product, rule));
  if (rule.ids && rule.ids.length) {
    list = rule.ids.map((id) => list.find((product) => product.slug === id)).filter(Boolean);
  }
  if (rule.sort === "newest") return [...list].reverse();
  if (rule.sort === "featured") return [...list.filter((product) => product.badge), ...list.filter((product) => !product.badge)];
  return list;
}

module.exports = { productMatchesRule, productsForRule };
