import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';


export const addNotification = async ({
  type,
  recipientId,
  productId,
  userId,
  commentId,
  orderId
}) => {
  const db = admin.firestore();
  try {
    const timestamp = admin.firestore.Timestamp.now();
    const notificationRef = db.collection("notifications").doc();

    let notificationData = {
      id: notificationRef.id,
      type,
      recipientId,
      createdAt: timestamp,
      isRead: false,
    };

    if (["shipping_update", "review_reminder", "new_comment", "new_like", "last_shipping_day", "buyer_refund_eligibility"].includes(type) && productId) {
      const productSnap = await db.collection("products").doc(productId).get();
      if (productSnap.exists) {
        notificationData.imageUrl = productSnap.data().mainImage || null;
        notificationData.productSnapshot = {
          id: productSnap.id,
          title: productSnap.data().title,
        };
        notificationData.productId = productSnap.id;
      }
    }

    if (["new_follower", "new_comment", "new_like"].includes(type) && userId) {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        if (type === 'new_follower') {
          notificationData.imageUrl = userSnap.data().profileImage || null;
        }
        notificationData.userSnapshot = {
          id: userSnap.id,
          username: userSnap.data().username,
        };
        notificationData.userId = userSnap.id;
      }
    }

    if (type === "new_comment" && commentId) {
      console.log('fetching the comment', commentId)
      const commentSnap = await db.collection("products").doc(productId).collection("comments").doc(commentId).get();
      if (commentSnap.exists) {
        notificationData.commentSnapshot = {
          content: commentSnap.data().comment,
        };
        notificationData.commentId = commentSnap.id;
      }
    }

    if (["shipping_update", "review_reminder", "buyer_refund_eligibility"].includes(type) && orderId) {
      const orderSnap = await db.collection("users").doc(recipientId).collection("orders").doc(orderId).get();
      if (orderSnap.exists) {
        notificationData.orderSnapshot = {
          id: orderSnap.id,
          deliveredAt: orderSnap.data().updated || null,
        };
        notificationData.orderId = orderSnap.id;
      }
    }

    const messageTemplates = {
      new_follower: { // DONE & TESTED
        title: "New Follower",
        message: "started following you.",
      },
      new_comment: { // DONE & TESTED
        title: "New Comment",
        message: "commented on your listing:",
      },
      new_like: { // DONE & TESTED
        title: "New Like",
        message: "liked your listing:",
      },
      shipping_update: { // DONE & TESTED
        title: "Order Shipped",
        message: "Your order has been shipped for",
      },
      review_reminder: { // DONE & TESTED
        title: "Review Reminder",
        message: "Don't forget to review your recent purchase!",
      },
      last_shipping_day: { // DONE & TESTED
        title: "⚠️ Last Chance to Ship!",
        message: "must be shipped today! The buyer can request a refund if it is not shipped.",
      },
      buyer_refund_eligibility: { // DONE & TESTED
        title: "💰 Refund Available!",
        message: "has not been shipped. You may now request a refund if needed.",
      },
    };

    if (messageTemplates[type]) {
      notificationData.title = messageTemplates[type].title;
      notificationData.message = messageTemplates[type].message;
    }

    await notificationRef.set(notificationData);

    console.log("Updating notifications count for user:", recipientId);
    await db.collection('users').doc(recipientId).update({
      notifications: admin.firestore.FieldValue.increment(1)
    })
    return {
      success: true,
      id: notificationRef.id
    };
  } catch (error) {
    console.error("Error adding notification:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

export const onNewNotification = async (data, context) => {
  logger.info("~~~~~~~~~~~~ START onNewNotification ~~~~~~~~~~~~", data);
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  try {
    const notificationId = await addNotification(data);
    return {
      success: true,
      notificationId
    };
  } catch (error) {
    throw new https.HttpsError('internal', error.message);
  }
};
