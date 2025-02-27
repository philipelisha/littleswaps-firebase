import { logger, https } from "firebase-functions";
import admin from '../../adminConfig.js';
import { connectToPostgres } from './connectToPostgres.js';
import {
  insertQuery,
  updateQuery,
  deleteQuery,
  searchQuery,
} from './constants.js';
import { sendNotificationToUser } from "../utils/index.js";
import { statusTypes } from "../../order.config.js";
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";
import { updateProductSnippet } from "./updateProductSnippet.js";

const { productStatus } = statusTypes;

const sendNotifications = (product) => {
  const notifications = [];
  const { status, title, buyer, user, selectedSwapSpot } = product;

  const addNotification = (userId, prefix) => {
    notifications.push({
      userId,
      type: `${prefix}_${status}`,
      args: { title },
    });
  };

  switch (status) {
    case productStatus.PENDING_SHIPPING:
      addNotification(buyer, "buyer");
      addNotification(user, "seller");
      break;

    case productStatus.PENDING_SWAPSPOT_ARRIVAL:
      addNotification(buyer, "buyer");
      addNotification(user, "seller");
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


export const createProduct = async (event) => {
  logger.info("~~~~~~~~~~~~ START createProduct ~~~~~~~~~~~~", event);
  let db;
  try {
    const productId = event.params.productId;
    const productDoc = await admin
      .firestore()
      .collection("products")
      .doc(productId)
      .get();
    const data = productDoc.data();

    await updateUsersListingCounts(data.user, {
      isNew: true,
      updatingActive: true,
      isActive: data.active,
      isSold: false,
    });
    updateProductSnippet(data.user);

    db = connectToPostgres();

    await db.none(insertQuery, [
      productId,
      data.active,
      data.user,
      data.title,
      data.mainImage,
      data.price,
      data.priceCurrency,
      data.location || null,
      data.latitude,
      data.longitude,
      data.mainCategory,
      data.subCategory || null,
      data.size || null,
      data.brand || null,
      data.colors || null,
      data.isNewWithTags,
      data.likes || 1,
      new Date(data.updated * 1000).toISOString(),
      data.availableShipping || null,
      data.shippingIncluded || null,
      data.condition || null,
      data.username || null,
      data.originalPrice || null,
    ])
  } catch (error) {
    logger.error(
      "Error connecting or inserting into PostgreSQL database:",
      error,
    )
  } finally {
    db && db.$pool.end();
  }
}

export const updateProduct = async (event) => {
  logger.info("~~~~~~~~~~~~ START updateProduct ~~~~~~~~~~~~", event);
  let db;
  try {
    const beforeData = event.data.before.data();
    const data = event.data.after.data();
    logger.info('beforeData', beforeData)
    logger.info('afterData', data)

    const productId = event.params.productId;
    const firestoreDb = admin.firestore();
    try {
      if (
        beforeData.title !== data.title ||
        beforeData.mainImage !== data.mainImage
      ) {
        const updatedImage = beforeData.mainImage !== data.mainImage;
        const likeSnapShot = await firestoreDb
          .collection("likes")
          .where('product', '==', productId)
          .get();

        const batch = firestoreDb.batch();
        likeSnapShot.forEach((doc) => {
          const likeRef = doc.ref;
          batch.update(likeRef, { title: data.title });
        });

        const notificationSnapshot = await firestoreDb
          .collection("notifications")
          .where("productId", "==", productId)
          .get();

        notificationSnapshot.forEach((doc) => {
          const notificationRef = doc.ref;
          batch.update(notificationRef, {
            ...(updatedImage && {
              imageUrl: data.mainImage
            }),
            "productSnapshot.title": data.title,
          });
        });

        await batch.commit();
      }
    } catch (error) {
      logger.error('Error updating the PostgreSQL record :', error);
    }

    try {
      updateUsersListingCounts(data.user, {
        isActive: data.active,
        updatingActive: beforeData.active !== data.active,
        isSold: Boolean(!beforeData.purchaseDate && data.purchaseDate),
      });
    } catch (error) {
      logger.error(`Error updating the user(${data.user}) listings count: `, error.message);
    }

    try {
      updateProductSnippet(data.user);
    } catch (error) {
      logger.error(`Error updating the product snippet with user(${data.user}):`, error.message);
    }

    try {
      if (data.status === productStatus.PENDING_SHIPPING || data.status === productStatus.PENDING_SWAPSPOT_ARRIVAL) {
        sendNotifications(data);
      }
    } catch (error) {
      logger.error(`Error sending the notifications(status: ${data.status}):`, error.message);
    }

    try {
      if (beforeData.price > data.price) {
        logger.info('price drop alert');
        const followersSnapshot = await firestoreDb
          .collection("followers")
          .where("follower", "==", data.user)
          .get();

        if (!followersSnapshot.empty) {
          const timestamp = admin.firestore.Timestamp.now();
          const batch = firestoreDb.batch();

          followersSnapshot.forEach((doc) => {
            const followerData = doc.data();
            const newNotificationRef = firestoreDb.collection('notifications').doc();
            const followerRef = firestoreDb.collection('users').doc(followerData.user);
            batch.set(newNotificationRef, {
              type: 'price_drop',
              title: "Price Drop Alert",
              recipientId: followerData.user,
              message: "The seller has dropped the price for",
              createdAt: timestamp,
              isRead: false,
              imageUrl: data.mainImage || null,
              productSnapshot: {
                id: productId,
                title: data.title,
              },
              productId: productId,
            });
            batch.update(followerRef, {
              notifications: admin.firestore.FieldValue.increment(1)
            })
          });

          await batch.commit();
          logger.info('Price drop notifications sent successfully.');
        }
      }
    } catch (error) {
      logger.error('Sending price drop notifications error:', error);
    }


    db = connectToPostgres();

    await db.none(updateQuery,
      [
        data.active,
        data.user,
        data.title,
        data.mainImage,
        data.price,
        data.priceCurrency,
        data.location || null,
        data.latitude,
        data.longitude,
        data.mainCategory,
        data.subCategory || null,
        data.size || null,
        data.brand || null,
        data.colors || null,
        data.isNewWithTags,
        data.likes || 1,
        new Date(data.updated * 1000).toISOString(),
        data.availableShipping,
        data.purchaseDate ? new Date(data.purchaseDate.seconds * 1000).toISOString() : null,
        data.condition || null,
        data.shippingIncluded || null,
        data.username || null,
        data.originalPrice || null,
        productId
      ])
  } catch (error) {
    logger.error('Error updating the PostgreSQL record :', error);
  } finally {
    db && db.$pool.end();
  }
};

export const deleteProduct = async (event) => {
  logger.info("~~~~~~~~~~~~ START deleteProduct ~~~~~~~~~~~~", event);
  const productId = event.params.productId;

  let db;
  try {
    db = connectToPostgres();
    await db.none(deleteQuery, [productId]);

    logger.info(`Product with ID ${productId} deleted from PostgreSQL`);
  } catch (error) {
    console.error(
      `Error deleting product with ID ${productId} from PostgreSQL:`,
      error,
    );
  } finally {
    db && db.$pool.end();
  }

  return null;
}

export const searchProducts = async (data, context) => {
  logger.info("~~~~~~~~~~~~ START searchProducts ~~~~~~~~~~~~", data);
  let db;
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.")
    }

    db = connectToPostgres();
    const {
      textFilter = null,
      mainCategoryFilter = null,
      subCategoryFilter = null,
      brandFilter = null,
      colorFilter = null,
      sizeFilter = null,
      priceFilterMin = null,
      priceFilterMax = null,
      shippingFilter,
      conditionFilter,
      userId = null,
      isProfile = false,
      isCurrentUser = false,
      longitude = null,
      latitude = null,
      radius = null,
      sortBy = 'updated',
      sortDirection = 'DESC',
      offset = 0,
      isMainCategoryArray = false,
      isSubCategoryArray = false,
      isBrandArray = false,
    } = data;
    // console.log('data', data);

    const radiusInMeters = radius ? radius * 1609.34 : null;

    const results = await db.any(
      searchQuery({
        isProfile,
        isCurrentUser,
        sortBy,
        sortDirection,
        offset,
        isMainCategoryArray,
        isSubCategoryArray,
        isBrandArray,
      }),
      [
        textFilter ? `%${textFilter}%` : null,
        mainCategoryFilter,
        subCategoryFilter,
        brandFilter,
        colorFilter,
        sizeFilter,
        priceFilterMin,
        priceFilterMax,
        shippingFilter,
        conditionFilter,
        userId,
        longitude,
        latitude,
        radiusInMeters
      ],
    );

    return {
      results,
      totalCount: results.length > 0 ? results[0].total_count : 0
    };
  } catch (error) {
    console.error('error: ', error.message)
    logger.error('Error connecting or getting the data from Postgres:', error);
    throw new https.HttpsError('internal', 'Internal Server Error');
  } finally {
    db && db.$pool.end();
  }
};

export const onShare = async (data, context) => {
  logger.info("~~~~~~~~~~~~ START onShare ~~~~~~~~~~~~", data);
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.")
    }

    const { productId, userId } = data;
    const firestoreDb = admin.firestore();
    await firestoreDb
      .collection("products")
      .doc(productId)
      .update({
        shares: admin.firestore.FieldValue.increment(1),
      });

    await firestoreDb
      .collection("users")
      .doc(userId)
      .update({
        totalShares: admin.firestore.FieldValue.increment(1),
      });

  } catch (error) {
    logger.error('on share error', error.message)
  }
}