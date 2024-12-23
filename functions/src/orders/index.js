import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';
import { orderActions, orderStatuses } from '../../order.config.js';
import stripe from "stripe";
import { sendNotificationToUser } from '../utils/pushNotifications.js';
import { emailTemplates, sendEmail } from '../utils/emails.js';
import { addDays, format } from 'date-fns';

const stripeSDK = stripe(process.env.stripeKey)

const db = admin.firestore();
const userRef = db.collection("users")
const productRef = db.collection("products")
const { productStatus } = orderStatuses;

const getUserDocAndData = async (id) => {
  const doc = userRef.doc(id);
  const docSnapshot = await doc.get();
  return {
    doc,
    data: docSnapshot.data(),
  };
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
}) => {
  const paymentIntent = await stripeSDK.paymentIntents.retrieve(paymentIntentId);
  const total = paymentIntent.amount_received;

  const { commission, shippingRate = 0, swapSpotCommission = 0 } = purchasePriceDetails;
  if (swapSpotId) {
    await stripeSDK.transfers.create({
      amount: Math.round(swapSpotCommission),
      currency: 'usd',
      destination: await getUserStripeAccountId(swapSpotId),
      source_transaction: paymentIntent.id,
    });
  }

  await stripeSDK.transfers.create({
    amount: Math.round(total - swapSpotCommission - commission - shippingRate),
    currency: 'usd',
    destination: await getUserStripeAccountId(seller),
    source_transaction: paymentIntent.id,
  });
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
      status,
      updated: new Date()
    });
  }

  return {
    paymentIntent,
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
    buyer = doc.data().buyer;
    seller = doc.data().seller;
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

const handleSwapSpotFulfillment = async ({ swapSpotId, productId }) => {
  const status = productStatus.COMPLETED;
  const { buyer, seller } = await updateUserSwapSpotInventoryStatus(swapSpotId, productId, status);
  const { paymentIntentId, title } = await updateUserOrderStatus(buyer, productId, status);
  await updateProductStatus(productId, status);
  await handleStripeTransfers({
    swapSpotId,
    paymentIntentId,
    seller,
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

  sendShippedEmails(product, order);
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

const handleDelivered = async ({ productId }) => {
  const status = productStatus.COMPLETED;
  const product = await updateProductStatus(productId, status);
  const { purchasePriceDetails } = product;
  const { paymentIntentId, order } = await updateUserOrderStatus(product.buyer, productId, status);
  await handleStripeTransfers({
    paymentIntentId,
    purchasePriceDetails,
    seller: product.user,
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
  await sendNotificationToUser({
    userId: product.buyer,
    type: 'buyer_' + status,
    args: {
      title: product.title
    }
  });

  await sendDeliveredEmails(product, order);
};

const actionHandlers = {
  [orderActions.SWAPSPOT_RECEIVING]: handleSwapSpotReceiving,
  [orderActions.SWAPSPOT_FULFILLMENT]: handleSwapSpotFulfillment,
  [orderActions.LABEL_CREATED]: handleLabelCreated,
  [orderActions.SHIPPED]: handleShipped,
  [orderActions.OUT_FOR_DELIVERY]: handleOutForDelivery,
  [orderActions.DELIVERED]: handleDelivered,
};

const sendShippedEmails = async (product, order) => {
  const { data: seller } = await getUserDocAndData(product.user);
  const { doc: buyerDoc, data: buyer } = await getUserDocAndData(product.buyer);
  const addressSnapShot = await buyerDoc
    .collection('shippingAddress')
    .doc(order.selectedAddress)
    .get();
  const address = addressSnapShot.data();

  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_SHIPPED,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: [
        {
          name: product.title,
          tracking: product.shippingNumber,
          order_number: order.product.slice(0, 6),
          delivery_method: order.shippingCarrier
        }
      ],
      firstName: seller.firstName
    }
  })
  await sendEmail({
    email: buyer.email,
    templateId: emailTemplates.BUYER_SHIPPED,
    data: {
      name: buyer.firstName + ' ' + buyer.lastName,
      order: {
        total: order.purchasePriceDetails.total,
        subtotal: product.price,
        order_number: order.id.slice(0, 6),
        shipping_day: format(new Date(), 'MM/dd/yyyy'),
        delivery_method: order.shippingCarrier,
        tracking_number: product.shippingNumber,
        delivery_method_fee: order.purchasePriceDetails.shippingRate
      },
      product: [
        {
          name: product.title,
          size: product.size,
          color: product.colors.join(', '),
          price: product.price
        }
      ],
      customer: {
        name: address.name,
        address_1st_line: `${address.street} ${address.street2}`,
        address_2nd_line: `${address.city}, ${address.state} ${address.zip}`
      },
      firstName: buyer.firstName
    }
  })
};

const sendDeliveredEmails = async (product, order) => {
  const { data: seller } = await getUserDocAndData(product.user);
  const { data: buyer } = await getUserDocAndData(product.buyer);

  const today = format(new Date(), 'MM/dd/yyyy');
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_DELIVERED,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: [
        {
          name: product.title,
          arrival_date: today,
          order_number: order.product.slice(0, 6)
        }
      ],
      firstName: seller.firstName
    }
  })
  await sendEmail({
    email: seller.email,
    templateId: emailTemplates.SELLER_PAYMENT,
    data: {
      name: seller.firstName + ' ' + seller.lastName,
      product: [
        {
          name: product.title,
          earned: product.price,
          arrival_date: today,
          order_number: order.product.slice(0, 6)
        }
      ],
      firstName: seller.firstName
    }
  })
  await sendEmail({
    email: buyer.email,
    templateId: emailTemplates.BUYER_DELIVERED,
    data: {
      name: buyer.firstName + ' ' + buyer.lastName,
      product: product.title,
      order_number: order.id.slice(0, 6),
      delivery_method: order.shippingCarrier,
    }
  })
};

export const onUpdateOrderStatus = async ({ type, swapSpotId, productId }) => {
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

    await handler({ swapSpotId, productId });

    logger.info('Order status updated successfully.');
    return true

  } catch (error) {
    logger.error(JSON.stringify(error.message));
    return false
  }
}

export const updateOrderStatus = async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.");
    }

    await onUpdateOrderStatus(data);

    return {
      success: true,
      message: 'Order status updated successfully.',
    };
  } catch (error) {
    logger.error(JSON.stringify(error.message));
    return {
      success: false,
      message: error.message,
      status: 'failed to update order status'
    };
  }
};

export const createOrder = async (event) => {
  try {
    const { userId, orderId } = event.params;
    logger.info(`Processing order creation for userId: ${userId}, orderId: ${orderId}`);

    const [orderDoc, buyerDoc] = await Promise.all([
      userRef.doc(userId).collection('orders').doc(orderId).get(),
      userRef.doc(userId).get()
    ]);

    if (!orderDoc.exists || !buyerDoc.exists) {
      logger.error(`Order or User not found for userId: ${userId}, orderId: ${orderId}`);
      return;
    }

    const order = orderDoc.data();
    const buyer = buyerDoc.data();

    const sellerDoc = await userRef.doc(order.seller).get();
    const seller = sellerDoc.data();
    logger.info(`Order data retrieved:`, order);

    const isSwapSpot = Boolean(order.selectedSwapSpot);

    const transaction = await stripeSDK.tax.transactions.createFromCalculation({
      calculation: order.taxCalculationId,
      reference: order.paymentIntent,
      expand: ['line_items']
    });

    await stripeSDK.paymentIntents.update(order.paymentIntent, {
      metadata: {
        tax_transaction: transaction.id,
        productId: order.product,
      },
    });

    const productUpdate = {
      buyer: userId,
      active: false,
      status: isSwapSpot
        ? orderStatuses.productStatus.PENDING_SWAPSPOT_ARRIVAL
        : orderStatuses.productStatus.PENDING_SHIPPING,
      purchaseDate: order.purchaseDate,
      purchasePriceDetails: order.purchasePriceDetails,
      ...(isSwapSpot ? { selectedSwapSpot: order.selectedSwapSpot } : { selectedAddress: order.selectedAddress })
    };

    await productRef.doc(order.product).update(productUpdate);
    logger.info(`Product ${order.product} updated successfully.`);

    if (isSwapSpot) {
      await userRef.doc(order.selectedSwapSpot).collection('swapSpotInventory').add({
        title: order.title,
        buyer: userId,
        mainImage: order.mainImage,
        product: order.product,
        purchaseDate: order.purchaseDate,
        seller: order.seller,
        status: orderStatuses.productStatus.PENDING_SWAPSPOT_ARRIVAL,
      });

      const swapSpotDoc = await userRef.doc(order.selectedSwapSpot).get();
      const swapSpot = swapSpotDoc.data();

      const { length, width, height, distanceUnit } = order.parcel;
      await sendEmail({
        email: swapSpot.email,
        templateId: emailTemplates.SWAPSPOT_NEW_ORDER,
        data: {
          name: `${swapSpot.firstName} ${swapSpot.lastName}`,
          product: [{
            date: format(new Date(order.purchaseDate.seconds * 1000), 'MM/dd/yyyy'),
            size: `${length}${distanceUnit} x ${width}${distanceUnit} x ${height}${distanceUnit}`,
            username: seller.username,
            arrival_date: format(addDays(new Date(order.purchaseDate.seconds * 1000), 3), 'MM/dd/yyyy'),
            pickup_date: format(addDays(new Date(order.purchaseDate.seconds * 1000), 6), 'MM/dd/yyyy'),
            order_number: orderId.slice(0, 6)
          }]
        }
      });

      logger.info(`Swap spot inventory updated for spot: ${order.selectedSwapSpot}`);
    }

    const emailPromises = [
      sendEmail({
        email: buyer.email,
        templateId: emailTemplates.BUYER_NEW_ORDER,
        data: {
          name: `${buyer.firstName} ${buyer.lastName}`,
          order_number: orderId.slice(0, 6)
        }
      }),
      sendEmail({
        email: seller.email,
        templateId: emailTemplates.SELLER_NEW_ORDER,
        data: {
          name: `${seller.firstName} ${seller.lastName}`,
          product: [{
            name: order.title,
            size: order.size,
            color: order.colors.join(', '),
            price: order.price
          }]
        }
      })
    ];

    await Promise.all(emailPromises);
  } catch (error) {
    logger.error(`Error processing order creation: ${error.message}`, error);
  }
};
