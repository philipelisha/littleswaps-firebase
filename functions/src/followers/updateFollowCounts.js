import admin from '../../adminConfig.js';
import { logger } from "firebase-functions";

export const updateFollowCounts = async (userId, increment, isFollower) => {
  try {
    const userDoc = admin.firestore().collection("users").doc(userId);
    await userDoc.update({
      [isFollower ? 'followers' : 'following']: admin.firestore.FieldValue.increment(increment),
    });

    return true;
  } catch (error) {
    logger.error('Error updating follow counts:', error);
    throw error;
  }
};
