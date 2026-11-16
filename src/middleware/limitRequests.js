const { rateLimit } = require("express-rate-limit");

// Stops one visitor from calling a route too many times in a short while.
function limitRequests(maxRequests, minutes, message) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });
}

module.exports = limitRequests;
