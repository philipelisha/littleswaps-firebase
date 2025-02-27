import { logger } from "firebase-functions";
import { getIdsFromEvent, addNotification } from "../utils/index.js";
import { updateFollowCounts } from "./updateFollowCounts.js";

export const createFollower = async (event) => {
  logger.info("~~~~~~~~~~~~ START createFollower ~~~~~~~~~~~~", event);
  try {
    const { user, document } = getIdsFromEvent(event, "followerId");

    await updateFollowCounts(user, 1);
    await updateFollowCounts(document, 1, true);

    await addNotification({
      type: 'new_follower',
      recipientId: document,
      userId: user,
    })

    logger.info('Updated the follow counts after ADD:', `${user}_${document}`);
    return null;
  } catch (error) {
    logger.error('Error processing addFollower error:', error);
    return null;
  }
};

export const deleteFollower = async (event) => {
  logger.info("~~~~~~~~~~~~ START deleteFollower ~~~~~~~~~~~~", event);
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
