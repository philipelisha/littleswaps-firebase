import admin from '../../adminConfig.js';
import { https, logger } from 'firebase-functions';
import { statusTypes } from '../../order.config.js';
import stripe from "stripe";
import { emailTemplates, sendEmail } from '../utils/index.js';
import { addBusinessDays, format } from 'date-fns';
import { onUpdateOrderStatus } from './onUpdateOrderStatus.js';
import { createLabel } from '../payments/index.js';
import { sendNotification } from './sendNotification.js';

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

    try {
      sendNotification(order, userId);
    } catch (error) {
      logger.error(`Error sending notification: ${error.message}`, error);
    }

    try {
      await updateLikesWithIsSold(order.productBundle?.map(item => item.productId) || [order.product.productId]);
    } catch (error) {
      logger.error(`Error updating likes as sold: ${error.message}`, error);
    }

    try {
      await updateCartsWithIsSold(order.productBundle?.map(item => item.productId) || [order.product.productId]);
    } catch (error) {
      logger.error(`Error updating carts as sold: ${error.message}`, error);
    }

    let salesRef;
    let saleDoc;
    try {
      salesRef = userRef.doc(order.seller).collection('sales')
      saleDoc = await salesRef.add({
        purchaseDate: order.purchaseDate,
        status: order.status,
        buyer: userId,
        product: order.product,
        productBundle: order.productBundle,
        discountData: order.discountData || null,
        purchasePriceDetails: order.purchasePriceDetails,
        ...(order.selectedSwapSpot && { selectedSwapSpot: order.selectedSwapSpot }),
        ...(order.selectedAddress && { selectedAddress: order.selectedAddress }),
        shippingIncluded: order.shippingIncluded,
        orderId: orderDoc.id,
      })
    } catch (error) {
      logger.error(`Error creating sale document: ${error.message}`, error);
    }

    try {
      userRef.doc(userId).collection('orders').doc(orderId).update({
        salesId: saleDoc.id,
      })
    } catch (error) {
      logger.error(`Error updating the order with the sale id: ${error.message}`, error);
    }

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
        discountData: order.discountData || null,
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
      await userRef.doc(order.selectedSwapSpot).collection('swapSpotInventory').add({
        buyer: userId,
        product: order.product,
        productBundle: order.productBundle,
        purchaseDate: order.purchaseDate,
        updated: order.purchaseDate,
        seller: order.seller,
        status: productStatus.PENDING_SWAPSPOT_ARRIVAL,
        userAndSaleId: `${order.seller}_${saleDoc.id}`,
        isCompleted: false,
        orderId: orderDoc.id,
        salesId: saleDoc.id,
      });

      const swapSpotDoc = await userRef.doc(order.selectedSwapSpot).get();
      const swapSpot = swapSpotDoc.data();

      await sendEmail({
        email: swapSpot.email,
        templateId: emailTemplates.SWAPSPOT_NEW_ORDER,
        data: {
          name: `${swapSpot.firstName} ${swapSpot.lastName}`,
          product: [{
            date: format(new Date(order.purchaseDate.seconds * 1000), 'MM/dd/yyyy'),
            size: 'Typically 6x9 to 12x15 inches',
            username: seller.username,
            arrival_date: 'On or before: ' + format(addBusinessDays(new Date(order.purchaseDate.seconds * 1000), 3), 'MM/dd/yyyy'),
            pickup_date: 'On or before: ' + format(addBusinessDays(new Date(order.purchaseDate.seconds * 1000), 6), 'MM/dd/yyyy'),
            order_number: orderId.slice(0, 6)
          }]
        }
      });

      logger.info(`Swap spot inventory updated for spot: ${order.selectedSwapSpot}`);
    }

    if (order.discountData) {
      try {
        db.collection('discounts').doc(order.discountData.code).update({
          timesUsed: admin.firestore.FieldValue.increment(1)
        })
      } catch (error) {
        console.error('error applying the times used to a discount', error.message)
      }
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

const updateLikesWithIsSold = async (productIds) => {
  try {
    const batch = db.batch();

    for (const productId of productIds) {
      const likesSnapshot = await db.collection('likes')
        .where('product', '==', productId)
        .get();
      likesSnapshot.forEach(doc => {
        batch.update(doc.ref, { isSold: true });
      });
    }

    await batch.commit();
    logger.info(`Likes updated for products: ${productIds.join(', ')}`);
  } catch (error) {
    logger.error(`Error updating likes: ${error.message}`, error);
  }
};

const updateCartsWithIsSold = async (productIds) => {
  try {
    const batch = db.batch();

    for (const productId of productIds) {
      const cartSnapshot = await db
        .collection("carts")
        .where("productIds", "array-contains", productId)
        .get();

      cartSnapshot.forEach((doc) => {
        const cartRef = doc.ref;
        const cartData = doc.data();

        const updatedSellers = cartData.sellers.map((seller) => {
          return {
            ...seller,
            products: seller.products.map((product) => {
              if (product.productId === productId) {
                return {
                  ...product,
                  isSold: true,
                };
              }
              return product;
            }),
          };
        });

        batch.update(cartRef, { sellers: updatedSellers });
      });
    }

    await batch.commit();
    logger.info(`Carts updated with isSold for products: ${productIds.join(', ')}`);
  } catch (error) {
    logger.error(`Error updating carts with isSold: ${error.message}`, error);
  }
};
