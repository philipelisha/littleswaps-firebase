export const getIdsFromEvent = (event, key) => {
  const uniqueId = event.params[key];
  return {
    user: uniqueId.substring(0, uniqueId.indexOf("_")),
    document: uniqueId.substring(uniqueId.indexOf("_") + 1, uniqueId.length),
  }
};