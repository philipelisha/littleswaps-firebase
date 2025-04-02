import { statusTypes } from '../../order.config.js';
const { productStatus } = statusTypes;
import { sendNotificationToUser } from "../utils/index.js";

export const sendNotification = (order, buyer) => {
  const notifications = [];
  const { status, seller, selectedSwapSpot, productBundle, product } = order;
  const { title } = productBundle ? productBundle[0] : product;
  const addNotification = (userId, prefix) => {
    notifications.push({
      userId,
      type: `${prefix}_${status}`,
      args: { title: productBundle ? title + ` + ${productBundle.length - 1} more` : title },
    });
  };

  switch (status) {
    case productStatus.PENDING_SHIPPING:
      addNotification(buyer, "buyer");
      addNotification(seller, "seller");
      break;

    case productStatus.PENDING_SWAPSPOT_ARRIVAL:
      addNotification(buyer, "buyer");
      addNotification(seller, "seller");
      addNotification(selectedSwapSpot, "swapspot");
      break;
  }

  notifications.forEach(({ userId, type, args }) => {
    sendNotificationToUser({
      userId,
      type,
      args,
    });
  });
};