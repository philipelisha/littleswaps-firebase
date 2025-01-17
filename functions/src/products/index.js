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
      data.brand,
      data.colors || null,
      data.isNewWithTags,
      data.likes || 0,
      new Date(data.updated * 1000).toISOString(),
      data.availableShipping || null,
      data.condition || null,
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
  // TODO: should update the reviews that reference this product if appropriate fields are changed
  let db;
  try {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    logger.info('beforeData', beforeData)
    logger.info('afterData', afterData)

    const productId = event.params.productId;
    const productDoc = await admin
      .firestore()
      .collection("products")
      .doc(productId)
      .get();
    const data = productDoc.data();

    updateUsersListingCounts(data.user, {
      isActive: data.active,
      updatingActive: beforeData.active !== afterData.active,
      isSold: Boolean(!beforeData.purchaseDate && afterData.purchaseDate),
    });

    if (data.status === productStatus.PENDING_SHIPPING || data.status === productStatus.PENDING_SWAPSPOT_ARRIVAL) {
      sendNotifications(data);
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
        data.location,
        data.latitude,
        data.longitude,
        data.mainCategory,
        data.subCategory,
        data.size,
        data.brand,
        data.colors,
        data.isNewWithTags,
        data.likes,
        new Date(data.updated * 1000).toISOString(),
        data.availableShipping,
        data.purchaseDate ? new Date(data.purchaseDate.seconds * 1000).toISOString() : null,
        data.condition,
        productId
      ])
  } catch (error) {
    logger.error('Error updating the PostgreSQL record :', error);
  } finally {
    db && db.$pool.end();
  }
};

export const deleteProduct = async (event) => {
  // use a batch for all of these.
  // Get the product from firebase using productId. 
  // current user is product.user productUniqueKey is product.key
  // TODO: should remove any images of this product
    // `images/products/${currentUser.id}/${productUniqueKey}/

  // TODO: should remove any likes of this product
  //look through like collection and get all likes with like.product = productId and delete them. 

  // TODO: should remove any product ids from the users (user.comments) that have left comments
// gets subcollection comments then update the user from users collection using the id comment.user
// updates the user.comments to remove it from the array. Currently it is added like this: firestore.FieldValue.arrayUnion(productId)

  // TODO: (should remove any reviews of this product) - not doing this because you should not be able to delete sold products
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
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.")
    }

    const { productId, userId } = data;

    await admin
      .firestore()
      .collection("products")
      .doc(productId)
      .update({
        shares: admin.firestore.FieldValue.increment(1),
      });

    await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .update({
        totalShares: admin.firestore.FieldValue.increment(1),
      });

  } catch (error) {
    logger.error('on share error', error.message)
  }
}