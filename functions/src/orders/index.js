import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';
import { statusTypes } from '../../order.config.js';
import stripe from "stripe";
import { emailTemplates, sendEmail } from '../utils/index.js';
import { addBusinessDays, format } from 'date-fns';
import { onUpdateOrderStatus } from './onUpdateOrderStatus.js';
import { createLabel } from '../payments/index.js';
import { sendNotificationToUser } from "../utils/index.js";
const { productStatus } = statusTypes;

const stripeSDK = stripe(process.env.stripeKey)
const db = admin.firestore();
const userRef = db.collection("users")
const productRef = db.collection("products")

export const updateOrderStatus = async (data, context) => {
  logger.info("~~~~~~~~~~~~ START updateOrderStatus ~~~~~~~~~~~~", data);
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

const sendNotifications = (order, buyer) => {
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

export const createOrder = async (event, stripe = stripeSDK) => {
  logger.info("~~~~~~~~~~~~ START createOrder ~~~~~~~~~~~~", event);
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

    sendNotifications(order, userId);

    const salesRef = userRef.doc(order.seller).collection('sales')
    const saleDoc = await salesRef.add({
      purchaseDate: order.purchaseDate,
      status: order.status,
      buyer: userId,
      product: order.product,
      productBundle: order.productBundle,
      purchasePriceDetails: order.purchasePriceDetails,
      ...(order.selectedSwapSpot && { selectedSwapSpot: order.selectedSwapSpot }),
      ...(order.selectedAddress && { selectedAddress: order.selectedAddress }),
      shippingIncluded: order.shippingIncluded,
      orderId: orderDoc.id,
    })

    if (order.shippingRate) {
      await createLabel({
        rateId: order.shippingRate,
        sellerId: order.seller,
        salesId: saleDoc.id,
      })
    }

    const transaction = await stripe.tax.transactions.createFromCalculation({
      calculation: order.taxCalculationId,
      reference: order.paymentIntent,
      expand: ['line_items']
    });

    await stripe.paymentIntents.update(order.paymentIntent, {
      metadata: {
        tax_transaction: transaction.id,
        orderId: `${userId}_${orderId}`,
      },
    });

    const updateProductData = async (bundleItem, index, length) => {
      const productUpdate = {
        buyer: userId,
        active: false,
        status: isSwapSpot
          ? productStatus.PENDING_SWAPSPOT_ARRIVAL
          : productStatus.PENDING_SHIPPING,
        purchaseDate: order.purchaseDate,
        purchasePriceDetails: order.purchasePriceDetails,
        orderId: orderDoc.id,
        salesId: saleDoc.id,
        ...(index === 0 && {
          firstBundleProduct: true,
          productBundleAmount: length,
        }),
        isBundle: index !== undefined,
        ...(isSwapSpot ? { selectedSwapSpot: order.selectedSwapSpot } : { selectedAddress: order.selectedAddress })
      };

      await productRef.doc(bundleItem.productId).update(productUpdate);
      logger.info(`Product ${bundleItem.productId} updated successfully.`);
    };

    if (order.productBundle?.length) {
      await Promise.all(order.productBundle.map((bundleItem, index) => updateProductData(bundleItem, index, order.productBundle.length)));
    } else {
      await updateProductData(order.product);
    }

    if (isSwapSpot) {
      // TODO: handle Bundles
      await userRef.doc(order.selectedSwapSpot).collection('swapSpotInventory').add({
        title: order.title,
        buyer: userId,
        mainImage: order.mainImage,
        product: order.product,
        purchaseDate: order.purchaseDate,
        seller: order.seller,
        status: productStatus.PENDING_SWAPSPOT_ARRIVAL,
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
            arrival_date: format(addBusinessDays(new Date(order.purchaseDate.seconds * 1000), 3), 'MM/dd/yyyy'),
            pickup_date: format(addBusinessDays(new Date(order.purchaseDate.seconds * 1000), 6), 'MM/dd/yyyy'),
            order_number: orderId.slice(0, 6)
          }]
        }
      });

      logger.info(`Swap spot inventory updated for spot: ${order.selectedSwapSpot}`);
    }

    const formatProductForEmail = (product) => ({
      name: product.title,
      size: product.size || '',
      color: (product.colors || []).join(', '),
      price: product.price
    });

    const emailPromises = [
      sendEmail({
        email: buyer.email,
        templateId: emailTemplates.BUYER_NEW_ORDER,
        data: {
          name: `${buyer.firstName} ${buyer.lastName}`,
          order_number: orderId.slice(0, 6),
          order_number_full: orderId,
        }
      }),
      sendEmail({
        email: seller.email,
        templateId: emailTemplates.SELLER_NEW_ORDER,
        data: {
          name: `${seller.firstName} ${seller.lastName}`,
          product: order.productBundle?.length
            ? order.productBundle.map(formatProductForEmail)
            : [formatProductForEmail(order.product)]
        }
      })
    ];

    await Promise.all(emailPromises);

  } catch (error) {
    logger.error(`Error processing order creation: ${error.message}`, error);
  }
};
