import { logger } from 'firebase-functions';
import admin from '../../adminConfig.js';
import { sendNotificationToUser, addNotification } from '../utils/index.js';
import { statusTypes } from '../../order.config.js';
import { eachDayOfInterval, isWeekend } from 'date-fns';

const getBusinessDaysBetween = (startDate, endDate) => {
  return eachDayOfInterval({ start: startDate, end: endDate })
    .filter(date => !isWeekend(date))
    .length - 1;
};

export const dailyShippingReminder = async () => {
  const db = admin.firestore();
  const now = new Date();
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(now.getDate() - 7);

  const snapshot = await db.collection("products")
    .where("purchaseDate", ">=", sixDaysAgo)
    .where("status", "==", statusTypes.productStatus.LABEL_CREATED)
    .orderBy("purchaseDate", "asc")
    .get();

  if (snapshot.empty) {
    console.log("No products requiring shipping reminders.");
    return null;
  }

  const updates = [];
  snapshot.forEach((doc) => {
    const product = doc.data();
    if (product.isBundle && !product.firstBundleProduct) {
      return;
    }

    const purchaseDate = product.purchaseDate.toDate();
    const businessDaysPassed = getBusinessDaysBetween(purchaseDate, now);

    let type = null;
    if (businessDaysPassed === 1) type = "seller_shipping_reminder_1";
    else if (businessDaysPassed === 2) type = "seller_shipping_reminder_2";
    else if (businessDaysPassed === 3) type = "seller_shipping_reminder_3";

    logger.info('How many businessDaysPassed: ', businessDaysPassed)
    logger.info('Sending notification type: ', type)
    if (type) {
      updates.push(
        sendNotificationToUser({
          userId: product.user,
          type,
          args: {
            title: `${product.title}${product.isBundle ? ` + ${product.productBundleAmount - 1} more` : ''}`,
            date: purchaseDate.toISOString(),
          },
        })
      );

      if (type === "seller_shipping_reminder_3") {
        updates.push(
          addNotification({
            type: "last_shipping_day",
            recipientId: product.user,
            productId: doc.id,
            productBundleAmount: product.isBundle ? product.productBundleAmount : 0,
          })
        )
      }
    }

    if (businessDaysPassed === 4) {
      updates.push(
        db.collection("users")
          .doc(product.buyer)
          .collection('orders')
          .doc(product.orderId)
          .update({
            canRequestRefund: true
          })
      )
      updates.push(
        addNotification({
          type: "buyer_refund_eligibility",
          recipientId: product.buyer,
          productId: doc.id,
          orderId: product.orderId,
          productBundleAmount: product.isBundle ? product.productBundleAmount : 0,
        })
      )
      updates.push(
        sendNotificationToUser({
          userId: product.buyer,
          type: "buyer_refund_eligibility",
          args: {
            title: `${product.title}${product.isBundle ? ` + ${product.productBundleAmount - 1} more` : ''}`,
          },
        })
      );
    }
  });

  await Promise.all(updates);
  console.log("Shipping reminders and refund notifications sent successfully.");
  return null;
};