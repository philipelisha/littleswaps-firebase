import admin from "../../adminConfig.js";
import { logger } from "firebase-functions";

export const updateUsersListingCounts = async (user, {
  isNew = false,
  isActive = false,
  updatingActive = false,
  isSold = false,
}) => {
  try {
    const newValues = {
      ...(isNew && {
        totalListings: admin.firestore.FieldValue.increment(1),
      }),
      ...(isSold && {
        totalSold: admin.firestore.FieldValue.increment(1),
      }),
      ...(updatingActive && {
        totalActive: admin.firestore.FieldValue.increment(
          isActive ? 1 : !isNew ? -1 : 0
        ),
      }),
    };
    logger.info('Updating the user listing counts to: ', JSON.stringify(newValues));
    const userDoc = admin.firestore().collection("users").doc(user);

    if (Object.keys(newValues).length > 0) {
      await userDoc.update(newValues);
    } else {
      logger.info('No updates needed for user listing counts.');
    }

    const updatedDoc = await userDoc.get();
    if (updatedDoc.exists) {
      const data = updatedDoc.data();
      const values = {
        totalListings: data.totalListings,
        totalSold: data.totalSold,
        totalActive: data.totalActive
      };
      logger.info('Updated user listing counts:', values);
    } else {
      logger.warn('Document does not exist after update.');
    }
    
    logger.info('User listing counts updated successfully.');
  } catch (error) {
    logger.error('Error updating user listing counts:', error);
  }
};