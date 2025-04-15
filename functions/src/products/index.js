import { logger, https } from "firebase-functions";
import admin from '../../adminConfig.js';
import { connectToPostgres } from './connectToPostgres.js';
import {
  insertQuery,
  updateQuery,
  deleteQuery,
  searchQuery,
} from './constants.js';
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";
import { updateProductSnippet } from "./updateProductSnippet.js";
import { syncProducts } from "./syncProducts.js";

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
      data.gender || null,
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
    await syncProducts({ productId, beforeData, data, })

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
        data.gender || null,
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
      genderFilter,
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
      limit = 10,
      userIdList = null,
      updatedAfterDate = null,
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
        limit,
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
        genderFilter,
        userId,
        longitude,
        latitude,
        radiusInMeters,
        userIdList?.length ? userIdList : null,
        updatedAfterDate,
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

export { deleteProductSingle } from './deleteProductSingle.js';
export { generateProductListing } from './generateProductListing.js';