const DAY = 24 * 60 * 60 * 1000;

function readTimeZone(value) {
  const timeZone = String(value || "UTC");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return timeZone;
  } catch (error) {
    return "UTC";
  }
}

// The last few days as "2026-11-09" text in the given time zone, oldest first.
function lastDays(days, timeZone) {
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const list = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    list.push(dayFormat.format(new Date(Date.now() - index * DAY)));
  }
  return list;
}

module.exports = { DAY, readTimeZone, lastDays };
