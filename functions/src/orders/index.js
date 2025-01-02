import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';
import { statusTypes } from '../../order.config.js';
import stripe from "stripe";
import { emailTemplates, sendEmail } from '../utils/index.js';
import { addDays, format } from 'date-fns';

const stripeSDK = stripe(process.env.stripeKey)

const db = admin.firestore();
const userRef = db.collection("users")
const productRef = db.collection("products")

import { onUpdateOrderStatus } from './onUpdateOrderStatus.js';
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

export const createOrder = async (event, stripe = stripeSDK) => {
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

    const transaction = await stripe.tax.transactions.createFromCalculation({
      calculation: order.taxCalculationId,
      reference: order.paymentIntent,
      expand: ['line_items']
    });

    await stripe.paymentIntents.update(order.paymentIntent, {
      metadata: {
        tax_transaction: transaction.id,
        productId: order.product,
      },
    });

    const productUpdate = {
      buyer: userId,
      active: false,
      status: isSwapSpot
        ? statusTypes.productStatus.PENDING_SWAPSPOT_ARRIVAL
        : statusTypes.productStatus.PENDING_SHIPPING,
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
        status: statusTypes.productStatus.PENDING_SWAPSPOT_ARRIVAL,
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
