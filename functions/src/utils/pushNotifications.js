import admin from '../../adminConfig.js';
import { logger } from 'firebase-functions';
import { getNotificationPayload } from './getNotificationPayload.js';

export const sendNotificationToUser = async ({ userId, type, args }) => {
  const payload = getNotificationPayload(type, args);

  if (payload) {
    logger.info('payload: ', JSON.stringify(payload))
    logger.info('userId: ', JSON.stringify(userId))
    return await sendNotification(userId, payload);
  }
}

const sendNotification = async (userId, payload) => {
  const userDoc = await admin.firestore().collection('users').doc(userId).get();

  if (userDoc.exists) {
    const userData = userDoc.data();
    const pushToken = userData.pushToken;

    if (pushToken) {
      logger.info('pushToken: ', JSON.stringify(pushToken))
      const formattedPayload = {
        ...payload.message,
        token: pushToken,
      };
      logger.info('Final payload: ', JSON.stringify(formattedPayload));

      try {
        const response = await admin.messaging().send(formattedPayload);
        logger.info('Notification sent successfully to user:', userId);
        return response;
      } catch (error) {
        logger.warn('FCM error:', error.message);
      }
    } else {
      logger.warn('No FCM token found for user:', userId);
    }
  } else {
    logger.warn('No user document found for user ID:', userId);
  }
}