import { logger } from "firebase-functions";
import admin from '../../adminConfig.js';
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";
import { updateProductSnippet } from "./updateProductSnippet.js";

export const syncProducts = async ({
  productId,
  beforeData,
  data,
}) => {
  const db = admin.firestore();
  const batch = db.batch();
  try {
    const updatedTitle = beforeData.title !== data.title;
    const updatedImage = beforeData.mainImage !== data.mainImage;
    const updatedPrice = beforeData.price !== data.price;
    const updatedSize = beforeData.size !== data.size
    const updatedPriceCurrency = beforeData.priceCurrency !== data.priceCurrency
    if (
      updatedTitle ||
      updatedImage ||
      updatedSize ||
      updatedPriceCurrency ||
      updatedPrice
    ) {

      const likeSnapShot = await db
        .collection("likes")
        .where('product', '==', productId)
        .get();

      likeSnapShot.forEach((doc) => {
        const likeRef = doc.ref;
        batch.update(likeRef, {
          title: data.title,
          mainImage: data.mainImage,
          size: data.size,
          price: data.price,
          priceCurrency: data.priceCurrency,
        });
      });

      if (updatedTitle || updatedImage) {
        const notificationSnapshot = await db
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
      }

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
                  title: data.title,
                  ...(updatedImage && { mainImage: data.mainImage }),
                  ...(updatedPrice && { price: data.price }),
                };
              }
              return product;
            }),
          };
        });

        batch.update(cartRef, { sellers: updatedSellers });
      });

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
    if (beforeData.price > data.price) {
      logger.info('price drop alert');
      const likesSnapShot = await db
        .collection("likes")
        .where("product", "==", productId)
        .get();

      if (!likesSnapShot.empty) {
        const timestamp = admin.firestore.Timestamp.now();

        likesSnapShot.forEach((doc) => {
          const likeData = doc.data();
          const newNotificationRef = db.collection('notifications').doc();
          const likerRef = db.collection('users').doc(likeData.user);
          batch.set(newNotificationRef, {
            type: 'price_drop',
            title: "Price Drop Alert",
            recipientId: likeData.user,
            message: `The seller has dropped the price from $${beforeData.price} to $${data.price} for`,
            createdAt: timestamp,
            isRead: false,
            imageUrl: data.mainImage || null,
            productSnapshot: {
              id: productId,
              title: data.title,
            },
            productId: productId,
          });
          batch.update(likerRef, {
            notifications: admin.firestore.FieldValue.increment(1)
          })
        });

        logger.info('Price drop notifications sent successfully.');
      }
    }

    await batch.commit();
  } catch (error) {
    logger.error('Sending price drop notifications error:', error);
  }
}