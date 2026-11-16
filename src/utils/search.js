// Words people type that don't help find a product.
const skipWords = new Set([
  "a", "an", "and", "the", "for", "my", "our", "your", "to", "of", "with", "who", "that", "is", "in", "on",
  "gift", "gifts", "idea", "ideas", "present", "presents", "something", "thing", "things", "best", "good",
  "great", "nice", "cool", "unique", "unusual", "find", "finds", "buy", "shop", "under", "below", "less",
  "than", "cheap", "dollars", "usd", "has", "have", "everything", "someone", "person", "people",
]);

// Words that tell us who the gift is for.
const audienceWords = {
  men: ["dad", "dads", "father", "fathers", "him", "he", "husband", "boyfriend", "men", "man", "mens", "brother", "grandpa", "grandfather", "guy", "guys"],
  women: ["mom", "moms", "mum", "mother", "mothers", "her", "she", "wife", "girlfriend", "women", "woman", "womens", "sister", "grandma", "grandmother", "lady"],
  kids: ["kid", "kids", "child", "children", "son", "daughter", "baby", "toddler", "teen", "teens", "boy", "girl"],
  couples: ["couple", "couples", "parents", "newlyweds", "wedding", "anniversary"],
};

function findMaxPrice(text) {
  const match = text.match(/(?:under|below|less than|max|up to)\s*\$?\s*(\d+)/) || text.match(/\$\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function findAudiences(words) {
  const found = [];
  Object.entries(audienceWords).forEach(([audience, list]) => {
    if (words.some((word) => list.includes(word))) found.push(audience);
  });
  return found;
}

// "gadgets" should also find "gadget", and "candles" should find "candle".
function wordForms(word) {
  const forms = [word];
  if (word.length > 3 && word.endsWith("ies")) forms.push(word.slice(0, -3) + "y");
  else if (word.length > 3 && word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("s")) forms.push(word.slice(0, -1));
  return forms;
}

function textHasWord(text, word) {
  return wordForms(word).some((form) => text.includes(form));
}

// Scores every product against what the person typed. Higher score means a better match.
function searchProducts(query, products, categories) {
  const text = String(query || "").toLowerCase().trim();
  const allWords = text.split(/[^a-z0-9]+/).filter(Boolean);

  const maxPrice = findMaxPrice(text);
  const audiences = findAudiences(allWords);
  const audienceList = Object.values(audienceWords).flat();
  const keywords = allWords.filter((word) => !skipWords.has(word) && !audienceList.includes(word) && !/^\d+$/.test(word));

  const matchedCategories = categories
    .filter((category) => keywords.some((word) => textHasWord(category.label.toLowerCase(), word) || textHasWord(category.slug, word)))
    .map((category) => category.slug);

  const results = [];

  products.forEach((product) => {
    if (maxPrice !== null && product.price.amount > maxPrice) return;
    if (audiences.length > 0) {
      const fitsAudience = product.audiences.some((audience) => audiences.includes(audience) || audience === "everyone");
      if (!fitsAudience) return;
    }

    let score = 0;
    const name = product.name.toLowerCase();
    const description = `${product.description} ${product.details || ""}`.toLowerCase();
    const badge = (product.badge || "").toLowerCase();

    keywords.forEach((word) => {
      if (textHasWord(name, word)) score += 5;
      else if (textHasWord(description, word)) score += 2;
      if (textHasWord(badge, word)) score += 1;
    });
    if (product.categories.some((slug) => matchedCategories.includes(slug))) score += 4;

    // When the search only says who it's for or a price, every product that fits is a match.
    if (keywords.length > 0 && score === 0) return;
    if (product.badge) score += 0.5;

    results.push({ product, score });
  });

  results.sort((a, b) => b.score - a.score || a.product.position - b.product.position);

  return {
    products: results.map((result) => result.product),
    understood: { keywords, audiences, maxPrice, categories: matchedCategories },
  };
}

module.exports = searchProducts;
