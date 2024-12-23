import { logger } from "firebase-functions";
import { getIdsFromEvent } from "../utils/index.js";
import { updateFollowCounts } from "./updateFollowCounts.js";

export const createFollower = async (event) => {
  try {
    const { user, document } = getIdsFromEvent(event, "followerId");

    await updateFollowCounts(user, 1);
    await updateFollowCounts(document, 1, true);

    logger.info('Updated the follow counts after ADD:', `${user}_${document}`);
    return null;
  } catch (error) {
    logger.error('Error processing addFollower error:', error);
    return null;
  }
};

export const deleteFollower = async (event) => {
  try {
    const { user, document } = getIdsFromEvent(event, "followerId");

    await updateFollowCounts(user, -1);
    await updateFollowCounts(document, -1, true);

    logger.info('Updated the follow counts after delete:', `${user}_${document}`);
    return null;
  } catch (error) {
    logger.error('Error processing deleteFollower error:', error);
    return null;
  }
};
