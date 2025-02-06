import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';
import stripe from "stripe";
import { orderActions, statusTypes } from '../../order.config.js';
import { sendNotificationToUser } from '../utils/index.js';
import { sendDeliveredEmails, sendShippedEmails } from './sendOrderUpdateEmails.js';

const stripeSDK = stripe(process.env.stripeKey)
const { productStatus } = statusTypes;

const db = admin.firestore();
const userRef = db.collection("users")
const productRef = db.collection("products")

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
      throw new Error('No stripe account found');
    }

    return userData.stripeAccountId;
  } catch (error) {
    logger.error('Error fetching user stripe account ID:', error);
    return false;
  }
};

const handleStripeTransfers = async ({
  swapSpotId,
  paymentIntentId,
  purchasePriceDetails,
  seller,
  stripe,
  productId,
}) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  logger.info('payment intent from stripe', paymentIntent)
  const total = paymentIntent.amount_received;

  const { commission, shippingRate = 0, swapSpotCommission = 0, tax = 0 } = purchasePriceDetails;
  logger.info(`The price breakdown: total: ${total} commission: ${commission}, shippingRate: ${shippingRate} swapSpotCommission: ${swapSpotCommission}`)
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
        productId
      });
    }
  }

  const sellerStripeId = await getUserStripeAccountId(seller);
  const sellerEarnings = Math.round(
    total - (swapSpotCommission * 100) - (commission * 100) - (shippingRate * 100) - (tax * 100)
  );

  if (sellerStripeId) {
    await stripe.transfers.create({
      amount: sellerEarnings,
      currency: "usd",
      destination: sellerStripeId,
      source_transaction: paymentIntent.latest_charge,
    });
  } else {
    logger.warn(`Seller ${seller} has no Stripe account. Storing pending payout.`);
    await storePendingPayout({
      user: seller,
      amount: sellerEarnings / 100,
      chargeId: paymentIntent.latest_charge,
      productId
    });
  }
};

const storePendingPayout = async ({ user, amount, chargeId, productId }) => {
  try {
    await userRef.doc(user).update({
      pendingPayouts: admin.firestore.FieldValue.arrayUnion({
        amount,
        currency: "usd",
        chargeId,
        productId,
        timestamp: Date.now()
      })
    });
    logger.info(`Stored pending payout for seller ${user}: $${amount / 100}`);
  } catch (error) {
    logger.error("Error storing pending payout:", error);
  }
};

const updateUserOrderStatus = async (userId, productId, status) => {
  let paymentIntent;
  let title;
  let order;

  const userOrdersRef = userRef.doc(userId).collection('orders');
  const ordersSnapshot = await userOrdersRef.where('product', '==', productId).get();

  if (!ordersSnapshot.empty) {
    const docSnapshot = ordersSnapshot.docs[0];
    order = {
      ...docSnapshot.data(),
      id: docSnapshot.id,
    };
    paymentIntent = order.paymentIntent;
    title = order.title;

    await docSnapshot.ref.update({
      status: status,
      updated: new Date()
    });
  }

  return {
    paymentIntentId: paymentIntent,
    title,
    order
  };
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

const updateProductStatus = async (productId, status) => {
  const productDoc = productRef.doc(productId);
  await productDoc.update({
    status,
    purchaseStatusUpdated: new Date()
  });
  return (await productDoc.get()).data();
};

const handleShippedEmails = async (product, order) => {
  const [sellerResult, buyerResult, addressSnapShot] = await Promise.all([
    userRef.doc(product.buyer).get(),
    userRef.doc(product.user).get(),
    userRef
      .doc(product.buyer)
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
    product,
    order,
    address,
  })
};

const handleDeliveredEmails = async (product, order) => {
  const [sellerResult, buyerResult] = await Promise.all([
    await getUserData(product.user),
    await getUserData(product.buyer),
  ])

  await sendDeliveredEmails({
    product,
    order,
    seller: sellerResult.data(),
    buyer: buyerResult.data(),
  })
};

const handleSwapSpotReceiving = async ({ swapSpotId, productId }) => {
  const status = productStatus.PENDING_SWAPSPOT_PICKUP;
  const { buyer } = await updateUserSwapSpotInventoryStatus(swapSpotId, productId, status);
  const { title } = await updateUserOrderStatus(buyer, productId, status);
  await updateProductStatus(productId, status);
  await sendNotificationToUser({
    userId: buyer,
    type: 'buyer_' + productStatus.PENDING_SWAPSPOT_PICKUP,
    args: {
      title
    }
  });
};

const handleSwapSpotFulfillment = async ({ swapSpotId, productId, stripe }) => {
  const status = productStatus.COMPLETED;
  const { buyer, seller } = await updateUserSwapSpotInventoryStatus(swapSpotId, productId, status);
  const { paymentIntentId, title } = await updateUserOrderStatus(buyer, productId, status);
  const product = await updateProductStatus(productId, status);
  const { purchasePriceDetails } = product;
  await handleStripeTransfers({
    swapSpotId,
    paymentIntentId,
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

const handleLabelCreated = async ({ productId }) => {
  const status = productStatus.LABEL_CREATED;
  const product = await updateProductStatus(productId, status);
  await updateUserOrderStatus(product.buyer, productId, status);

  await sendNotificationToUser({
    userId: product.buyer,
    type: 'buyer_' + productStatus.LABEL_CREATED,
    args: {
      title: product.title
    }
  });
};

const handleShipped = async ({ productId }) => {
  const status = productStatus.SHIPPED;
  const product = await updateProductStatus(productId, status);
  const { order } = await updateUserOrderStatus(product.buyer, productId, status);

  await sendNotificationToUser({
    userId: product.buyer,
    type: 'buyer_' + productStatus.SHIPPED,
    args: {
      title: product.title
    }
  });

  handleShippedEmails(product, order);
};

const handleOutForDelivery = async ({ productId }) => {
  const status = productStatus.OUT_FOR_DELIVERY;
  const product = await updateProductStatus(productId, status);
  await updateUserOrderStatus(product.buyer, productId, status);
  await sendNotificationToUser({
    userId: product.buyer,
    type: 'buyer_' + productStatus.OUT_FOR_DELIVERY,
    args: {
      title: product.title
    }
  });
};

const handleDelivered = async ({ productId, stripe }) => {
  const status = productStatus.COMPLETED;
  const product = await updateProductStatus(productId, status);
  const { purchasePriceDetails } = product;
  const { paymentIntentId, order } = await updateUserOrderStatus(product.buyer, productId, status);

  await handleStripeTransfers({
    paymentIntentId,
    purchasePriceDetails,
    seller: product.user,
    stripe,
    productId,
  });
  await sendNotificationToUser({
    userId: product.user,
    type: 'seller_' + orderActions.DELIVERED,
    args: {}
  });
  await sendNotificationToUser({
    userId: product.buyer,
    type: 'DELIVERED',
    args: {
      title: product.title
    }
  });

  await handleDeliveredEmails(product, order);
};

const actionHandlers = {
  [orderActions.SWAPSPOT_RECEIVING]: handleSwapSpotReceiving, //done
  [orderActions.SWAPSPOT_FULFILLMENT]: handleSwapSpotFulfillment,
  [orderActions.LABEL_CREATED]: handleLabelCreated, //done
  [orderActions.SHIPPED]: handleShipped, //done
  [orderActions.OUT_FOR_DELIVERY]: handleOutForDelivery, //done
  [orderActions.DELIVERED]: handleDelivered, //done
};

export const onUpdateOrderStatus = async ({ type, swapSpotId, productId, stripe = stripeSDK }) => {
  try {
    logger.info('Order status start updating', {
      type,
      swapSpotId,
      productId
    });

    const handler = actionHandlers[type];
    if (!handler) {
      logger.error('Invalid order action type.');
      throw new https.HttpsError('invalid-argument', 'Invalid order action type.');
    }

    await handler({ swapSpotId, productId, stripe });

    logger.info('Order status updated successfully.');
    return true

  } catch (error) {
    console.log('error', error.message)
    logger.error(JSON.stringify(error.message));
    return false
  }
}