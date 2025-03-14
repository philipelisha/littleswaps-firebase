import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';
import stripe from "stripe";
import { orderActions, statusTypes } from '../../order.config.js';
import { sendNotificationToUser, addNotification } from '../utils/index.js';
import { sendDeliveredEmails, sendShippedEmails } from './sendOrderUpdateEmails.js';

const stripeSDK = stripe(process.env.stripeKey)
const { productStatus } = statusTypes;

const db = admin.firestore();
const userRef = db.collection("users")
const productRef = db.collection("products")

const getProductTitleFromSale = (sale) => {
  return sale.productBundle ? sale.productBundle[0].title + ` + ${sale.productBundle.length - 1} more` : sale.product.title
}

const getSellerAndSaleId = (userAndSaleId) => {
  const [userId, saleId] = userAndSaleId.split('_')
  return { userId, saleId }
};

const isSaleStatusUpdated = async (userAndSaleId, status) => {
  try {
    const { userId, saleId } = getSellerAndSaleId(userAndSaleId);

    const saleSnapshot = await userRef.doc(userId).collection('sales').doc(saleId).get();

    if (!saleSnapshot.exists) {
      logger.warn(`Product ${userAndSaleId} not found.`);
      return true;
    }

    const sale = saleSnapshot.data();

    if (sale.status === status) {
      logger.warn(`Sale ${userAndSaleId} already has status ${status}. Skipping update.`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error checking sale status:', error);
    return true;
  }
};

const getUserData = async (id) => {
  return await userRef.doc(id).get();
};

const getUserStripeAccountId = async (userId) => {
  try {
    const snapshot = await userRef.doc(userId).get();

    if (!snapshot.exists) {
      throw new Error('User not found');
    }

    const userData = snapshot.data();

    if (!userData.stripeAccountId) {
      logger.warn('No stripe account found');
      return false;
    }

    return userData.stripeAccountId;
  } catch (error) {
    logger.error('Error fetching user stripe account ID:', error);
    return false;
  }
};

const handleStripeTransfers = async ({
  swapSpotId,
  paymentIntent: paymentIntentId,
  purchasePriceDetails,
  seller,
  stripe,
  userAndSaleId,
}) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  logger.info('payment intent from stripe', paymentIntent)
  const totalPayed = paymentIntent.amount_received;

  const { commission, shippingRate = 0, swapSpotCommission = 0, tax = 0 } = purchasePriceDetails;
  logger.info(`The price breakdown: total: ${totalPayed} commission: ${commission}, shippingRate: ${shippingRate} swapSpotCommission: ${swapSpotCommission}`)
  if (swapSpotId) {
    const swapSpotStripeId = await getUserStripeAccountId(swapSpotId);
    const earnings = Math.round(swapSpotCommission * 100);
    if (swapSpotStripeId) {
      await stripe.transfers.create({
        amount: earnings,
        currency: "usd",
        destination: swapSpotStripeId,
        source_transaction: paymentIntent.latest_charge,
      });
    } else {
      logger.warn(`SwapSpot ${swapSpotId} has no Stripe account. Skipping transfer.`);
      await storePendingPayout({
        user: swapSpotId,
        amount: earnings / 100,
        chargeId: paymentIntent.latest_charge,
        userAndSaleId
      });
    }
  }

  const sellerStripeId = await getUserStripeAccountId(seller);
  const sellerEarningsInCents = Math.round(
    totalPayed - (swapSpotCommission * 100) - (commission * 100) - (shippingRate * 100) - (tax * 100)
  );

  if (sellerStripeId) {
    await stripe.transfers.create({
      amount: sellerEarningsInCents,
      currency: "usd",
      destination: sellerStripeId,
      source_transaction: paymentIntent.latest_charge,
    });
  } else {
    logger.warn(`Seller ${seller} has no Stripe account. Storing pending payout.`);
    await storePendingPayout({
      user: seller,
      amount: sellerEarningsInCents / 100,
      chargeId: paymentIntent.latest_charge,
      userAndSaleId
    });
  }
};

const storePendingPayout = async ({ user, amount, chargeId, userAndSaleId }) => {
  try {
    await userRef.doc(user).update({
      pendingPayouts: admin.firestore.FieldValue.arrayUnion({
        amount,
        currency: "usd",
        chargeId,
        userAndSaleId,
        timestamp: Date.now()
      })
    });
    logger.info(`Stored pending payout for seller ${user}: $${amount}`);
  } catch (error) {
    logger.error("Error storing pending payout:", error);
  }
};

const updateUserOrderStatus = async (userId, orderId, status) => {
  const orderDoc = userRef
    .doc(userId)
    .collection('orders')
    .doc(orderId);
  const orderSnapshot = await orderDoc.get();

  if (!orderSnapshot.exists) {
    throw new Error(`Order ${orderId} not found for user ${userId}`);
  }

  const order = {
    ...orderSnapshot.data(),
    id: orderId,
  };

  await orderDoc.update({
    status: status,
    updated: new Date(),
  });

  return order;
};

const updateUserSwapSpotInventoryStatus = async (userId, productId, status) => {
  let buyer;
  let seller;
  const swapSpotInventoryRef = userRef.doc(userId).collection('swapSpotInventory');
  const inventorySnapshot = await swapSpotInventoryRef.where('product', '==', productId).get();
  if (!inventorySnapshot.empty) {
    const doc = inventorySnapshot.docs[0];
    const data = doc.data()
    buyer = data.buyer;
    seller = data.seller;
    await doc.ref.update({
      status,
      updated: new Date()
    });
  }

  return {
    buyer,
    seller,
  };
};

const updateProductStatus = async (sale, status) => {
  const batch = db.batch();
  const productIds = sale.productBundle
    ? sale.productBundle.map(p => p.productId)
    : [sale.product.productId];

  productIds.forEach(productId => {
    const productRef = db.collection('products').doc(productId);
    batch.update(productRef, {
      status,
      statusUpdated: new Date(),
    });
  });

  await batch.commit();
};

const updateSaleStatus = async (userAndSaleId, status) => {
  try {
    console.log('Updating the sale status', userAndSaleId, status)
    const { userId, saleId } = getSellerAndSaleId(userAndSaleId);
    const saleDoc = userRef.doc(userId).collection('sales').doc(saleId);
    await saleDoc.update({
      status,
      purchaseStatusUpdated: new Date()
    });
    const doc = await saleDoc.get()
    const data = doc.data()
    await updateProductStatus(data, status)

    return {
      ...data,
      id: saleDoc.id,
      seller: userId,
    }
  } catch (error) {
    logger.error('Error updating sale status:', error);
    return false;
  }
};

const handleShippedEmails = async (sale, order) => {
  const [sellerResult, buyerResult, addressSnapShot] = await Promise.all([
    userRef.doc(sale.buyer).get(),
    userRef.doc(sale.seller).get(),
    userRef
      .doc(sale.buyer)
      .collection('shippingAddress')
      .doc(order.selectedAddress)
      .get(),
  ]);

  const seller = sellerResult.data();
  const buyer = buyerResult.data();
  const address = addressSnapShot.data();

  await sendShippedEmails({
    buyer,
    seller,
    sale,
    order,
    address,
  })
};

const handleDeliveredEmails = async (sale, order) => {
  const [sellerResult, buyerResult] = await Promise.all([
    await getUserData(sale.seller),
    await getUserData(sale.buyer),
  ])

  await sendDeliveredEmails({
    sale,
    order,
    seller: sellerResult.data(),
    buyer: buyerResult.data(),
  })
};

const handleSwapSpotReceiving = async ({ swapSpotId, productId }) => {
  // TODO: handle bundles
  const status = productStatus.PENDING_SWAPSPOT_PICKUP;
  if (await isSaleStatusUpdated(productId, status)) {
    return;
  }

  const { buyer } = await updateUserSwapSpotInventoryStatus(swapSpotId, productId, status);
  const { title } = await updateUserOrderStatus(buyer, productId, status);
  await updateSaleStatus(productId, status);
  await sendNotificationToUser({
    userId: buyer,
    type: 'buyer_' + productStatus.PENDING_SWAPSPOT_PICKUP,
    args: {
      title
    }
  });
};

const handleSwapSpotFulfillment = async ({ swapSpotId, userAndSaleId, stripe }) => {
  // TODO: handle bundles
  const status = productStatus.COMPLETED;
  if (await isSaleStatusUpdated(productId, status)) {
    return;
  }

  const { buyer, seller } = await updateUserSwapSpotInventoryStatus(swapSpotId, userAndSaleId, status);
  const { paymentIntent, product: orderProduct, productBundle } = await updateUserOrderStatus(buyer, userAndSaleId, status);
  const product = await updateSaleStatus(userAndSaleId, status);
  const { purchasePriceDetails } = product;
  await handleStripeTransfers({
    swapSpotId,
    paymentIntent,
    purchasePriceDetails,
    seller,
    stripe,
    productId,
  });
  await sendNotificationToUser({
    userId: seller,
    type: 'seller_' + orderActions.SWAPSPOT_FULFILLMENT,
    args: {}
  });
  await sendNotificationToUser({
    userId: buyer,
    type: 'buyer_' + productStatus.COMPLETED,
    args: {
      title
    }
  });
};

const handleLabelCreated = async ({ userAndSaleId }) => {
  const status = productStatus.LABEL_CREATED;
  if (await isSaleStatusUpdated(userAndSaleId, status)) {
    return;
  }

  const sale = await updateSaleStatus(userAndSaleId, status);
  await updateUserOrderStatus(sale.buyer, sale.orderId, status);

  await sendNotificationToUser({
    userId: sale.buyer,
    type: 'buyer_' + productStatus.LABEL_CREATED,
    args: {
      title: getProductTitleFromSale(sale)
    }
  });
};

const handleShipped = async ({ userAndSaleId }) => {
  const status = productStatus.SHIPPED;
  if (await isSaleStatusUpdated(userAndSaleId, status)) {
    return;
  }

  const sale = await updateSaleStatus(userAndSaleId, status);
  const order = await updateUserOrderStatus(sale.buyer, sale.orderId, status);

  await sendNotificationToUser({
    userId: sale.buyer,
    type: 'buyer_' + productStatus.SHIPPED,
    args: {
      title: getProductTitleFromSale(sale)
    }
  });

  await handleShippedEmails(sale, order);

  await addNotification({
    type: 'shipping_update',
    recipientId: sale.buyer,
    productId: sale.productBundle ? sale.productBundle[0].productId : sale.product.productId,
    orderId: order.id,
    productBundleAmount: sale.productBundle?.length || 0
  })
};

const handleOutForDelivery = async ({ userAndSaleId }) => {
  const status = productStatus.OUT_FOR_DELIVERY;
  if (await isSaleStatusUpdated(userAndSaleId, status)) {
    return;
  }

  const sale = await updateSaleStatus(userAndSaleId, status);
  await updateUserOrderStatus(sale.buyer, sale.orderId, status);
  await sendNotificationToUser({
    userId: sale.buyer,
    type: 'buyer_' + productStatus.OUT_FOR_DELIVERY,
    args: {
      title: getProductTitleFromSale(sale)
    }
  });
};

const handleDelivered = async ({ userAndSaleId, stripe }) => {
  const status = productStatus.COMPLETED;
  if (await isSaleStatusUpdated(userAndSaleId, status)) {
    return;
  }

  const sale = await updateSaleStatus(userAndSaleId, status);
  const { purchasePriceDetails } = sale;
  const { paymentIntent, ...order } = await updateUserOrderStatus(sale.buyer, sale.orderId, status);

  await handleStripeTransfers({
    paymentIntent,
    purchasePriceDetails,
    seller: sale.seller,
    stripe,
    userAndSaleId,
  });
  await sendNotificationToUser({
    userId: sale.seller,
    type: 'seller_' + orderActions.DELIVERED,
    args: {}
  });
  await sendNotificationToUser({
    userId: sale.buyer,
    type: 'DELIVERED',
    args: {
      title: getProductTitleFromSale(sale)
    }
  });

  await handleDeliveredEmails(sale, order);

  await addNotification({
    type: 'review_reminder',
    recipientId: sale.buyer,
    productId: sale.productBundle ? sale.productBundle[0].productId : sale.product.productId,
    orderId: order.id,
    productBundleAmount: sale.productBundle?.length || 0
  })
};

const actionHandlers = {
  [orderActions.SWAPSPOT_RECEIVING]: handleSwapSpotReceiving, //done
  [orderActions.SWAPSPOT_FULFILLMENT]: handleSwapSpotFulfillment,
  [orderActions.LABEL_CREATED]: handleLabelCreated, //done
  [orderActions.SHIPPED]: handleShipped, //done
  [orderActions.OUT_FOR_DELIVERY]: handleOutForDelivery, //done
  [orderActions.DELIVERED]: handleDelivered, //done
};

export const onUpdateOrderStatus = async ({ type, swapSpotId, userAndSaleId, stripe = stripeSDK }) => {
  try {
    logger.info('Order status start updating', {
      type,
      swapSpotId,
      userAndSaleId,
    });

    const handler = actionHandlers[type];
    if (!handler) {
      logger.error('Invalid order action type.');
      throw new https.HttpsError('invalid-argument', 'Invalid order action type.');
    }

    await handler({ swapSpotId, userAndSaleId, stripe });

    logger.info('Order status updated successfully.');
    return true

  } catch (error) {
    console.log('error', error.message)
    logger.error(JSON.stringify(error.message));
    return false
  }
}